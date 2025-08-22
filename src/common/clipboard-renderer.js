/*
 * Copyright Adam Pritchard 2025
 * MIT License : https://adampritchard.mit-license.org/
 */

/*
 * Clipboard-based rendering for Markdown Here.
 *
 * ## Overview
 *
 * This module implements a clipboard-based approach for rendering Markdown content
 * in web-based email composers (primarily Gmail). Instead of directly manipulating
 * the DOM, we copy HTML to the clipboard and paste it, which triggers the email
 * client's native paste handling.
 *
 * ## Why Clipboard Rendering?
 *
 * 1. **Gmail Compatibility**: Gmail's editor has complex handling for images. When
 *    images are pasted (rather than inserted via DOM manipulation), Gmail uploads
 *    them to its servers and replaces them with `blob:` URIs, then when the email is sent
 *    it attaches them to the email and uses Content-IDs (cid:) to reference them.
 *    Direct DOM insertion with data: URLs results in images that are stripped when the
 *    email is sent.
 *
 * 2. **Local TeX Rendering**: We render LaTeX math formulas locally using MathJax,
 *    converting them to PNG data URIs. The clipboard approach ensures these images
 *    are properly handled by Gmail. Supports both inline ($...$) and block ($$...$$)
 *    math with different sizing.
 *
 * ## Architecture
 *
 * The rendering process consists of three main phases:
 *
 * ### Phase 1: Image Processing (processImagesAsync)
 * 1. Render TeX formulas locally using MathJax (via TexRenderer)
 *    - Block formulas are rendered larger than inline formulas
 *    - PNG images have white background for dark mode compatibility
 *    - Smart scaling applied to normalize formula sizes
 * 2. Convert external image URLs to data URIs
 * 3. Encode image alt text and styles as JSON in the alt attribute
 *
 * ### Phase 2: Clipboard Paste (renderViaClipboard)
 * 1. Save existing clipboard contents (if focus permits)
 * 2. Copy processed HTML to clipboard using Clipboard API
 * 3. Execute paste command (document.execCommand('paste'))
 * 4. Restore original clipboard contents
 * 5. Start monitoring for image replacements
 *
 * ### Phase 3: Style Restoration (monitorPastedImages)
 * 1. Use MutationObserver to detect when Gmail replaces images
 * 2. Parse JSON from alt attributes
 * 3. Restore original styles and clean alt text
 *
 * ## Gmail-Specific Behavior
 *
 * When content is pasted in Gmail:
 * 1. Gmail processes pasted HTML asynchronously
 * 2. Images with data: URLs are uploaded to Gmail's servers
 * 3. Original <img> elements are replaced with new ones containing:
 *    - src: blob: URL (temporary) or cid: URL (permanent)
 *    - data-surl: cid: reference
 *    - Stripped style attributes (Gmail removes inline styles)
 *    - Preserved alt text (usually HTML-escaped)
 *
 * ## The JSON-in-Alt Approach
 *
 * To preserve image styling through Gmail's processing:
 * 1. Before paste: Encode {alt: "text", style: "css"} as JSON in alt attribute
 * 2. After paste: Parse JSON (handling HTML escaping), restore styles, clean alt
 * 3. Fallback: On non-Gmail sites, clean up JSON after 2-second timeout
 *
 * Example transformation:
 * - Before: <img alt="x^2" style="height:2em;vertical-align:-0.5em">
 * - Encoded: <img alt='{"alt":"x^2","style":"height:2em;vertical-align:-0.5em"}'>
 * - After Gmail: <img src="cid:..." alt="{&quot;alt&quot;:&quot;x^2&quot;...}">
 * - Restored: <img src="cid:..." alt="x^2" style="height:2em;vertical-align:-0.5em">
 *
 * ## Focus and Clipboard Challenges
 *
 * **Focus Requirements**: The Clipboard API requires the document to have focus
 * to read clipboard contents. This creates timing challenges:
 * - We must ensure focus is in the target document before attempting to save clipboard
 * - Focus is established after range operations but before clipboard operations
 * - Small delays (10-50ms) are used to ensure focus has taken effect
 *
 * **Clipboard Preservation**: To avoid destroying user's clipboard contents:
 * 1. saveClipboard() attempts to read current clipboard (requires focus)
 * 2. If successful, stores either full ClipboardItems or text-only fallback
 * 3. After paste completes, restoreClipboard() writes original content back
 * 4. If clipboard cannot be read (no focus), user is warned via console
 *
 * ## Configuration
 *
 * Key parameters (in monitorPastedImages):
 * - IDLE_TIMEOUT: 2000ms - Wait time after last mutation before cleanup
 * - MAX_TOTAL_WAIT: 10000ms - Maximum total monitoring time
 *
 * Math formula styling:
 * - Inline math: height based on smart scaling, baseline adjusted
 * - Block math: larger than inline, in tex-block div
 * - PNG render scale: 3x for high DPI displays
 * - All math images have white background for dark mode compatibility
 *
 * ## Browser Compatibility
 *
 * - Chrome: Full support, execCommand('paste') returns true
 * - Firefox: Full support, but execCommand('paste') may return false even on success
 * - Requires: Clipboard API, execCommand, MutationObserver, ClipboardItem
 *
 * ## Error Handling
 *
 * - No fallback DOM insertion (would break Gmail image handling)
 * - Failed paste operations are reported via callback
 * - JSON parsing errors are silently handled (image remains unchanged)
 * - MutationObserver disconnects after timeout to prevent memory leaks
 * - Clipboard restoration failures are logged but don't block operation
 *
 * ## Integration Points
 *
 * - TexRenderer: Provides local LaTeX-to-PNG rendering with smart scaling
 * - markdown-render.js: Creates placeholder images with data-math-formula attributes
 * - markdown-here.js: Determines when to use clipboard vs direct rendering
 * - marked.js: Extended with blockMath token type for $$...$$ support
 */

;(function() {

"use strict";
/* global TexRenderer */

var ClipboardRenderer = {};

/**
 * Process TeX formulas in HTML and convert them to inline data URI images.
 * Also converts any external image URLs to data URIs.
 *
 * @param {string} html - The HTML containing TeX formulas and images
 * @param {Object} options - Options object with clipboard-rendering-enabled flag
 * @returns {Promise<string>} HTML with all images as data URIs
 */
ClipboardRenderer.processImagesAsync = async function(html, options) {
  // If clipboard rendering is disabled or options are null, return unchanged
  if (!options || !options['clipboard-rendering-enabled']) {
    return html;
  }

  console.log('[ClipboardRenderer] Processing images in HTML');

  // First, handle math formula placeholders and render them locally
  // Pattern: <img data-math-formula="..." class="math-formula-placeholder">
  const mathPattern = /<img[^>]*data-math-formula="([^"]*)"[^>]*>/g;
  const mathMatches = [...html.matchAll(mathPattern)];

  console.log('[ClipboardRenderer] Found', mathMatches.length, 'math formulas to render locally');

  // Process each math formula
  for (const match of mathMatches) {
    const fullMatch = match[0];
    const encodedTexCode = match[1];
    const texCode = decodeURIComponent(encodedTexCode);

    // Check if it's block or inline math
    const isBlock = fullMatch.includes('data-math-display="block"') || fullMatch.includes('tex-block');

    console.log('[ClipboardRenderer] Rendering math formula:', texCode.substring(0, 30) + '...', 'Block:', isBlock);

    try {
      // Use local TeX renderer to generate PNG data URI with pre-scaled metrics
      const result = await TexRenderer.renderToDataURI(texCode, isBlock);

      // The PNG is already rendered at the scaled size, so use the metrics directly
      // No additional scaling needed - this prevents blurriness!
      console.log(`[ClipboardRenderer] Using pre-scaled metrics: ${result.heightEx.toFixed(2)}ex × ${result.widthEx.toFixed(2)}ex, baseline: ${result.baselineEx.toFixed(3)}ex`);

      // Use ex units directly (no calc() needed for single values)
      const newStyle = `height: ${result.heightEx.toFixed(3)}ex; ` +
                      `width: ${result.widthEx.toFixed(3)}ex; ` +
                      `vertical-align: ${result.baselineEx.toFixed(3)}ex; ` +
                      `display: inline-block`;

      // Replace the placeholder with the rendered image
      const newImg = fullMatch
        .replace(/data-math-formula="[^"]*"/, '')
        .replace(/src="[^"]*"/, `src="${result.dataUri}"`)
        .replace(/style="[^"]*"/, `style="${newStyle}"`)
        .replace(/class="math-formula-placeholder"/, 'class="math-formula-rendered"');
      html = html.replace(fullMatch, newImg);
      console.log('[ClipboardRenderer] Rendered math formula locally with pre-scaled PNG');
    } catch (e) {
      console.error('[ClipboardRenderer] Failed to render math formula:', e);
      // Leave the placeholder as is
    }
  }

  // Parse HTML to find all remaining external images
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const images = tempDiv.querySelectorAll('img');

  console.log('[ClipboardRenderer] Found', images.length, 'total images, converting external ones to data URIs');

  // Convert each external image to data URI
  for (const img of images) {
    if (img.src.startsWith('http')) {
      console.log('[ClipboardRenderer] Converting external image:', img.src.substring(0, 60) + '...');
      try {
        const dataUri = await ClipboardRenderer.fetchImageAsDataUri(img.src);
        if (dataUri) {
          img.src = dataUri;
          console.log('[ClipboardRenderer] Converted to data URI');
        }
      } catch (e) {
        console.error('[ClipboardRenderer] Failed to convert image:', e);
        // Keep original URL if conversion fails
      }
    }
  }

  // Encode alt and style information in JSON for all images
  // This allows us to restore styling after Gmail's image replacement
  for (const img of images) {
    // Get existing alt text (empty string if none)
    const originalAlt = img.alt || '';

    // Get inline styles (empty string if none)
    const styleToPreserve = img.getAttribute('style') || '';

    // Create unified JSON format
    const altData = {
      alt: originalAlt,
      style: styleToPreserve
    };

    // Encode in alt attribute (escape single quotes for HTML safety)
    img.alt = JSON.stringify(altData).replace(/'/g, '&#39;');

  }

  return tempDiv.innerHTML;
};

/**
 * Fetch an image and convert it to a data URI.
 *
 * @param {string} url - The image URL
 * @returns {Promise<string>} Data URI
 */
ClipboardRenderer.fetchImageAsDataUri = async function(url) {
  try {
    // Use fetch to get the image
    const response = await fetch(url);
    const blob = await response.blob();

    // Convert blob to data URI
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('[ClipboardRenderer] Failed to fetch image:', url, e);
    throw e;
  }
};

/**
 * Save current clipboard contents for later restoration.
 * MUST be called while focus is in the target document context.
 *
 * @param {Document} targetDoc - Optional target document for logging context
 * @returns {Promise<Object|null>} Saved clipboard data or null if unable to read
 */
ClipboardRenderer.saveClipboard = async function(targetDoc) {
  console.log('[ClipboardRenderer] Attempting to save clipboard contents...');

  // Log focus state for debugging (use provided doc or fallback to global document)
  const doc = targetDoc || document;
  console.log('[ClipboardRenderer] Document focus:', doc.hasFocus(), 'Active element:', doc.activeElement?.tagName);

  // Try full ClipboardItem read (best option - preserves all formats)
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      console.log('[ClipboardRenderer] ✓ Clipboard saved using read() - found', items.length, 'items');

      // Store the items for later restoration
      // We need to extract the data since ClipboardItems can't be reused
      const savedItems = [];
      for (const item of items) {
        const types = item.types;
        const itemData = {};
        for (const type of types) {
          try {
            const blob = await item.getType(type);
            itemData[type] = blob;
          } catch (e) {
            console.warn('[ClipboardRenderer] Could not read type', type, ':', e.message);
          }
        }
        if (Object.keys(itemData).length > 0) {
          savedItems.push(itemData);
        }
      }

      if (savedItems.length > 0) {
        return { type: 'items', data: savedItems };
      }
    }
  } catch (err) {
    console.warn('[ClipboardRenderer] ⚠️ Cannot read clipboard using read():', err.message);
    console.warn('[ClipboardRenderer] Focus must be in the target document to read clipboard.');
  }

  // Fallback to text-only read
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text) {
        console.log('[ClipboardRenderer] ✓ Clipboard saved using readText() - saved', text.length, 'characters');
        return { type: 'text', data: text };
      }
    }
  } catch (err) {
    console.warn('[ClipboardRenderer] ⚠️ Cannot read clipboard text:', err.message);
    console.warn('[ClipboardRenderer] Focus must be in the target document to read clipboard.');
  }

  console.log('[ClipboardRenderer] ℹ️ Clipboard preservation not available - user clipboard will be replaced');
  console.log('[ClipboardRenderer] To preserve clipboard, ensure focus is in the target document before rendering.');
  return null;
};

/**
 * Restore previously saved clipboard contents.
 *
 * @param {Object} saved - The saved clipboard data from saveClipboard()
 * @returns {Promise<boolean>} True if restoration succeeded
 */
ClipboardRenderer.restoreClipboard = async function(saved) {
  if (!saved) {
    console.log('[ClipboardRenderer] No saved clipboard to restore');
    return false;
  }

  console.log('[ClipboardRenderer] Attempting to restore clipboard...');

  try {
    if (saved.type === 'items') {
      // Restore multi-format clipboard items
      const clipboardItems = [];
      for (const itemData of saved.data) {
        const clipboardItem = new ClipboardItem(itemData);
        clipboardItems.push(clipboardItem);
      }
      await navigator.clipboard.write(clipboardItems);
      console.log('[ClipboardRenderer] ✓ Clipboard restored with original items');
      return true;
    } else if (saved.type === 'text') {
      // Restore text-only clipboard
      await navigator.clipboard.writeText(saved.data);
      console.log('[ClipboardRenderer] ✓ Clipboard restored with original text');
      return true;
    }
  } catch (err) {
    console.error('[ClipboardRenderer] ❌ Failed to restore clipboard:', err.message);
    return false;
  }

  return false;
};

/**
 * Copy HTML to clipboard using the modern Clipboard API.
 *
 * @param {string} html - The HTML to copy
 * @returns {Promise<void>}
 */
ClipboardRenderer.copyToClipboard = async function(html) {
  // Check if Clipboard API is available
  if (!navigator.clipboard || !navigator.clipboard.write) {
    throw new Error('Clipboard API not available');
  }

  try {
    // Create a ClipboardItem with HTML data
    const blob = new Blob([html], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    // Write to clipboard
    await navigator.clipboard.write([clipboardItem]);
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    throw err;
  }
};

/**
 * Execute paste command at the current cursor position.
 *
 * @param {Document} targetDoc - The target document to paste into (optional, defaults to document)
 * @returns {boolean} True if paste succeeded (Note: Firefox may return false even on success)
 */
ClipboardRenderer.executePaste = function(targetDoc) {
  try {
    // Use the target document if provided, otherwise use the global document
    const doc = targetDoc || document;

    // Use execCommand to trigger a paste event
    // This simulates a real user paste action
    const result = doc.execCommand('paste');

    // Note: Firefox often returns false even when the paste succeeds
    // We don't treat false as a failure

    return result;
  } catch (err) {
    console.error('Failed to execute paste:', err);
    return false;
  }
};

/**
 * Render markdown using clipboard approach.
 * This is the main entry point for clipboard-based rendering.
 *
 * @param {string} html - The rendered HTML to insert
 * @param {Range} range - The selection range to replace
 * @param {Object} options - Optional rendering options
 * @param {Function} callback - Callback when complete
 */
ClipboardRenderer.renderViaClipboard = async function(html, range, options, callback) {
  console.log('[ClipboardRenderer] Starting clipboard-based rendering');

  // Check if range is valid
  if (!range || !range.startContainer) {
    console.error('[ClipboardRenderer] Invalid range provided');
    if (callback) callback(false);
    return;
  }

  // Default options
  options = options || {};

  // Get the target document and window
  const targetDoc = range.startContainer.ownerDocument;
  const targetWindow = targetDoc.defaultView;

  // Variable to store saved clipboard
  let savedClipboard = null;

  try {
    // Convert all external images to data URIs
    const processedHtml = await ClipboardRenderer.processImagesAsync(html, options);
    console.log('[ClipboardRenderer] Processed HTML length:', processedHtml.length);

    // Delete the current selection
    range.deleteContents();
    console.log('[ClipboardRenderer] Deleted selection contents');

    // Ensure the target document/element has focus for clipboard operations
    // First try to focus the parent element of the range
    let targetElement = range.startContainer.parentElement || range.startContainer;
    if (targetElement.nodeType !== 1) {
      // If it's not an element node, get the parent element
      targetElement = targetElement.parentElement;
    }

    // Focus the window for clipboard operations
    if (targetWindow && targetWindow.focus) {
      targetWindow.focus();
    }

    // Focus the target element or body for paste operation
    if (targetElement && targetElement.focus) {
      targetElement.focus();
    } else if (targetDoc.body) {
      targetDoc.body.focus();
    }

    // Small delay to ensure focus has taken effect
    await new Promise(resolve => setTimeout(resolve, 10));

    // NOW that we have focus in the target context, save the clipboard
    // This is the right moment - after focus but before we write to clipboard
    try {
      savedClipboard = await ClipboardRenderer.saveClipboard(targetDoc);
    } catch (err) {
      console.warn('[ClipboardRenderer] Could not save clipboard:', err.message);
    }

    // Now paste the HTML with data URI images
    console.log('[ClipboardRenderer] Using HTML paste with data URI images');

    // Copy the processed HTML to clipboard
    await ClipboardRenderer.copyToClipboard(processedHtml);
    console.log('[ClipboardRenderer] HTML copied to clipboard');

    // Small delay to ensure clipboard is ready
    await new Promise(resolve => setTimeout(resolve, 200));

    // Execute paste in a new execution context to avoid "recursive" detection
    console.log('[ClipboardRenderer] Scheduling paste command...');
    await new Promise(resolve => {
      setTimeout(() => {
        console.log('[ClipboardRenderer] Executing paste command (deferred)...');
        const result = ClipboardRenderer.executePaste(targetDoc);
        console.log('[ClipboardRenderer] Paste command result:', result);
        // Note: In Firefox, execCommand('paste') may return false even when it succeeds
        // We don't check the result because the paste usually works regardless
        resolve();
      }, 0);  // Use 0 timeout to break out of current execution stack
    });

    // Longer delay to ensure paste completes and DOM updates
    await new Promise(resolve => setTimeout(resolve, 200));

    // Restore the original clipboard contents if we saved them
    if (savedClipboard) {
      // Wait longer before restoration to ensure paste is fully processed
      // This prevents the race condition where restoration happens before paste
      await new Promise(resolve => setTimeout(resolve, 200));
      await ClipboardRenderer.restoreClipboard(savedClipboard);
    }

    // Focus handling is now managed by the calling context (e.g., Options page)

    // Start monitoring for image replacements (Gmail blob: conversion)
    // Pass the container element to focus our search
    const container = range.startContainer.ownerDocument.activeElement ||
                     range.startContainer.parentElement ||
                     document.body;
    ClipboardRenderer.monitorPastedImages(container);

    if (callback) {
      callback(true);
    }
  } catch (err) {
    console.error('[ClipboardRenderer] Clipboard rendering failed:', err);
    console.error('[ClipboardRenderer] Error stack:', err.stack);

    // Try to restore clipboard even on error
    if (savedClipboard) {
      try {
        await ClipboardRenderer.restoreClipboard(savedClipboard);
      } catch (restoreErr) {
        console.error('[ClipboardRenderer] Failed to restore clipboard after error:', restoreErr.message);
      }
    }

    // No fallback - for Gmail and other email clients, we need the paste
    // to work properly to get cid: URLs. Data URI images won't survive sending.
    if (callback) {
      callback(false);
    }
  }
};

/**
 * Monitor pasted images and restore their styling after Gmail's blob: replacement.
 * This function sets up a MutationObserver to watch for image modifications.
 * @param {Element} container - Optional container element to search within
 */
ClipboardRenderer.monitorPastedImages = function(container) {
  // Configurable timeout - easy to adjust
  const IDLE_TIMEOUT = 2000; // 2 seconds
  const MAX_TOTAL_WAIT = 10000; // 10 seconds max

  const pastedImages = new Set();
  const processedImages = new Set();
  let timeoutId;
  const startTime = Date.now();

  const searchContainer = container || document.body;

  console.log('[ClipboardRenderer] Starting immediate image monitoring in:', searchContainer);

  // Helper function to check and process an image
  function checkImage(img) {
    // Skip if already processed
    if (processedImages.has(img) || pastedImages.has(img)) {
      return false;
    }

    console.log('[ClipboardRenderer] Checking new image:', {
      src: img.src.substring(0, 50),
      alt: img.alt.substring(0, 100),
      hasJSON: img.alt.includes('{') && img.alt.includes('}')
    });

    // Check if it has JSON-encoded alt (escaped or not)
    let hasJSON = false;
    let altData = null;

    try {
      // Try parsing as-is
      altData = JSON.parse(img.alt);
      hasJSON = true;
    } catch (e) {
      // Try unescaping HTML entities
      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = img.alt;
        const unescapedAlt = tempDiv.textContent || tempDiv.innerText || '';
        altData = JSON.parse(unescapedAlt);
        hasJSON = true;
      } catch (e2) {
        // Not JSON
      }
    }

    if (hasJSON && altData) {
      pastedImages.add(img);
      console.log('[ClipboardRenderer] Found pasted image with JSON alt');

      // If it's already been replaced by Gmail (blob: or cid:)
      if (img.src.startsWith('cid:') || img.src.startsWith('blob:')) {
        console.log('[ClipboardRenderer] Image already replaced, applying style');
        if (altData.style) {
          img.style.cssText = altData.style;
          console.log('[ClipboardRenderer] Applied style:', altData.style);
        }
        img.alt = altData.alt || '';
        processedImages.add(img);
      }

      return true;
    }

    return false;
  }

  // Check any existing images first
  searchContainer.querySelectorAll('img').forEach(checkImage);

  // Set up mutation observer to watch for new images and changes
  const observer = new MutationObserver(mutations => {
    let relevantMutation = false;

    for (const mutation of mutations) {
      // Check for new nodes being added (images)
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          // Check if it's an image element
          if (node.nodeType === 1) { // Element node
            if (node.tagName === 'IMG') {
              if (checkImage(node)) {
                relevantMutation = true;
              }
            } else if (node.querySelectorAll) {
              // Check for images within the added node
              node.querySelectorAll('img').forEach(img => {
                if (checkImage(img)) {
                  relevantMutation = true;
                }
              });
            }
          }
        });
      }

      // Check for image attribute changes
      if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
        const img = mutation.target;

        // If we're tracking this image and it's not processed yet
        if (pastedImages.has(img) && !processedImages.has(img)) {
          // Check if src changed to cid: or blob: (Gmail replacement)
          if (img.src.startsWith('cid:') || img.src.startsWith('blob:')) {
            relevantMutation = true;

            try {
              let altData;
              try {
                // Try parsing as-is
                altData = JSON.parse(img.alt);
              } catch (parseError) {
                // Try unescaping HTML entities first
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = img.alt;
                const unescapedAlt = tempDiv.textContent || tempDiv.innerText || '';
                altData = JSON.parse(unescapedAlt);
              }

              // Restore the style
              if (altData.style) {
                img.style.cssText = altData.style;
              }

              // Clean up alt to just the original text
              img.alt = altData.alt || '';

              processedImages.add(img);
            } catch (e) {
              console.error('[ClipboardRenderer] Failed to restore image style:', e);
            }
          }
        } else if (!pastedImages.has(img) && !processedImages.has(img)) {
          // New image we haven't seen - check if it has JSON alt
          if (checkImage(img)) {
            relevantMutation = true;
          }
        }
      }
    }

    // Reset timeout only for relevant mutations
    if (relevantMutation) {
      clearTimeout(timeoutId);

      if (Date.now() - startTime < MAX_TOTAL_WAIT) {
        console.log('[ClipboardRenderer] Resetting timeout, waiting for more changes');
        timeoutId = setTimeout(cleanup, IDLE_TIMEOUT);
      } else {
        console.log('[ClipboardRenderer] Max wait time reached, cleaning up');
        cleanup();
      }
    }
  });

  function cleanup() {
    observer.disconnect();
    console.log('[ClipboardRenderer] Stopping image monitoring');

    // Clean up any remaining JSON alt attributes (for sites that don't replace)
    let cleanedCount = 0;
    pastedImages.forEach(img => {
      if (!processedImages.has(img)) {
        try {
          let altData;
          try {
            // Try parsing as-is
            altData = JSON.parse(img.alt);
          } catch (parseError) {
            // Try unescaping HTML entities first
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = img.alt;
            const unescapedAlt = tempDiv.textContent || tempDiv.innerText || '';
            altData = JSON.parse(unescapedAlt);
          }
          img.alt = altData.alt || '';
          cleanedCount++;
        } catch (e) {
          // Already cleaned or parsing error
        }
      }
    });

    if (cleanedCount > 0) {
      console.log('[ClipboardRenderer] Cleaned up JSON alt on', cleanedCount, 'unprocessed images');
    }
  }

  // Start observing immediately
  observer.observe(searchContainer, {
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'alt'],
    subtree: true
  });

  // Initial timeout
  timeoutId = setTimeout(cleanup, IDLE_TIMEOUT);

  console.log('[ClipboardRenderer] Observer started, monitoring for images with JSON alt');

  // Return the cleanup function so callers can stop monitoring
  return cleanup;
};

/**
 * Check if clipboard rendering is supported in the current environment.
 *
 * @returns {boolean} True if clipboard rendering is supported
 */
ClipboardRenderer.isSupported = function() {
  const hasClipboard = !!navigator.clipboard;
  const hasWrite = !!(navigator.clipboard && navigator.clipboard.write);
  const hasExecCommand = !!document.execCommand;
  const hasClipboardItem = typeof ClipboardItem !== 'undefined';

  return hasClipboard && hasWrite && hasExecCommand && hasClipboardItem;
};

// Export for use in other modules
if (typeof module !== 'undefined') {
  module.exports = ClipboardRenderer;
} else if (typeof window !== 'undefined') {
  window.ClipboardRenderer = ClipboardRenderer;
}

})();