/*
 * Copyright Adam Pritchard 2025
 * MIT License : https://adampritchard.mit-license.org/
 */

/*
 * Local TeX-to-image renderer using MathJax for the clipboard paste approach.
 * This generates PNG data URIs for TeX formulas using MathJax (loaded locally).
 */

;(function() {

"use strict";

var TexRenderer = {};

// Check if MathJax is available
TexRenderer.checkMathJax = function() {
  if (typeof window === 'undefined') {
    console.log('[TexRenderer] No window object');
    return false;
  }
  if (!window.MathJax) {
    console.log('[TexRenderer] MathJax not found on window');
    return false;
  }
  return true;
};

// Wait for MathJax to be ready
TexRenderer.waitForMathJax = function() {
  return new Promise((resolve, reject) => {
    // Check if MathJax is already loaded and ready
    if (window.MathJax && window.MathJax.tex2svg) {
      resolve();
      return;
    }

    // Check if MathJax is loaded but not ready yet
    if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
      window.MathJax.startup.promise.then(() => {
        // After startup, tex2svg should be available
        if (window.MathJax.tex2svg) {
          resolve();
        } else {
          console.error('[TexRenderer] MathJax loaded but tex2svg not available. Check that mathjax-tex-svg-full.js is properly loaded.');
          reject(new Error('MathJax tex2svg not available after initialization'));
        }
      }).catch((e) => {
        console.error('[TexRenderer] MathJax initialization failed:', e);
        reject(e);
      });
    } else if (window.MathJax && window.MathJax.startup) {
      // MathJax is already initialized (no promise means it's done)
      // Give it a brief moment for tex2svg to be set up
      setTimeout(() => {
        if (window.MathJax.tex2svg) {
          resolve();
        } else {
          console.error('[TexRenderer] MathJax loaded but tex2svg not available. Check that mathjax-tex-svg-full.js is properly loaded.');
          reject(new Error('MathJax tex2svg not available'));
        }
      }, 100);
    } else {
      console.error('[TexRenderer] MathJax not loaded. Ensure mathjax-tex-svg-full.js is included before tex-renderer.js');
      reject(new Error('MathJax not loaded'));
    }
  });
};

/**
 * Apply smart scaling to normalize formula sizes.
 * Boosts small formulas more than large ones for visual consistency.
 *
 * @param {number} heightEx - Original height in ex units
 * @returns {number} Scaled height in ex units
 */
TexRenderer.smartScaleHeight = function(heightEx) {
  // Reduced sizes for better balance
  const MIN_HEIGHT = 1.6;  // Smaller minimum for single characters
  const TARGET_HEIGHT = 2.2; // Reduced target for medium formulas
  const MAX_HEIGHT = 5.0;  // Slightly reduced maximum

  // Simplified scaling with better thresholds based on actual formula sizes
  // "x" is ~1.0ex, lowercase sigma ~1.0ex, uppercase Sigma ~1.54ex, fractions ~4.5ex+
  if (heightEx < 1.2) {
    // Small (single letters like "x", lowercase sigma): moderate boost
    return MIN_HEIGHT;
  } else if (heightEx < 2.0) {
    // Medium (uppercase Sigma ~1.54ex): gentle scaling
    const t = (heightEx - 1.2) / 0.8; // normalize to 0-1
    return MIN_HEIGHT + (TARGET_HEIGHT - MIN_HEIGHT) * t * 0.7; // Dampen the scaling
  } else if (heightEx < 6) {
    // Large (fractions, quadratic): controlled scaling
    const t = (heightEx - 2.0) / 4.0; // normalize to 0-1
    return TARGET_HEIGHT + (MAX_HEIGHT - TARGET_HEIGHT) * Math.pow(t, 0.8);
  } else {
    // Very large (complex matrices): logarithmic capping
    return MAX_HEIGHT + 0.5 * Math.log(heightEx / 6);
  }
};

/**
 * Renders TeX formula to a PNG data URI using MathJax.
 *
 * @param {string} texCode - The TeX formula code
 * @param {boolean} isBlock - Whether this is a block (display) formula
 * @returns {Promise<string>} Data URI of the rendered PNG image
 */
TexRenderer.renderToDataURI = async function(texCode, isBlock) {
  try {
    // Check if MathJax is available
    if (!TexRenderer.checkMathJax()) {
      throw new Error('MathJax not available');
    }

    // Wait for MathJax to be ready
    await TexRenderer.waitForMathJax();

    // Use MathJax to convert TeX to SVG
    if (typeof MathJax.tex2svg !== 'function') {
      throw new Error('MathJax.tex2svg is not available. Ensure mathjax-tex-svg-full.js is properly loaded.');
    }

    const wrapper = MathJax.tex2svg(texCode, {
      display: !!isBlock
    })

    // Get the SVG element
    const svg = wrapper.querySelector ? wrapper.querySelector('svg') : wrapper.getElementsByTagName('svg')[0];
    if (!svg) {
      throw new Error('MathJax failed to generate SVG');
    }

    // Extract original MathJax metrics in ex units
    const widthAttr = svg.getAttribute('width');   // e.g., "2.843ex"
    const heightAttr = svg.getAttribute('height'); // e.g., "1.676ex"
    const verticalAlign = svg.style.verticalAlign || '0ex'; // e.g., "-0.566ex"

    // Parse ex values
    const widthEx = parseFloat(widthAttr) || 0;
    const heightEx = parseFloat(heightAttr) || 0;
    const baselineEx = parseFloat(verticalAlign) || 0;

    /*
    console.log('[TexRenderer] SVG metrics:', {
      widthEx,
      heightEx,
      baselineEx,
      verticalAlign
    });
    */

    // Apply smart scaling BEFORE creating the PNG
    let scaledHeightEx = TexRenderer.smartScaleHeight(heightEx);

    // For block math, increase size by 20%
    if (isBlock) {
      scaledHeightEx *= 1.2;
    }

    const heightRatio = scaledHeightEx / heightEx;
    const scaledWidthEx = widthEx * heightRatio;
    const scaledBaselineEx = baselineEx * heightRatio;

    //console.log(`[TexRenderer] Smart scaling: ${heightEx.toFixed(2)}ex → ${scaledHeightEx.toFixed(2)}ex (ratio: ${heightRatio.toFixed(2)}x)`);

    // Clone the SVG for manipulation
    const svgClone = svg.cloneNode(true);

    // Ensure the SVG has the proper namespace
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Convert SCALED ex units to pixels for PNG creation
    // Standard conversion: 1ex ≈ 8px at normal font sizes
    // Render at 3x for high DPI screens (recipients may have high DPI too)
    // Note: We can't use window.devicePixelRatio because emails are viewed on different devices
    const RENDER_SCALE = 3;  // Always render at 3x for quality
    const EX_TO_PX = 8 * RENDER_SCALE;  // 24px per ex for high quality
    const width = Math.ceil(scaledWidthEx * EX_TO_PX);
    const height = Math.ceil(scaledHeightEx * EX_TO_PX);

    // Set explicit pixel dimensions for PNG rendering
    svgClone.setAttribute('width', width);
    svgClone.setAttribute('height', height);

    // No padding - use exact dimensions
    const canvasWidth = width;
    const canvasHeight = height;

    // Serialize the SVG
    const svgString = new XMLSerializer().serializeToString(svgClone);

    // Create data URI
    const svgDataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));

    // Convert SVG to PNG using canvas
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext('2d');

        // White background for dark mode compatibility
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the SVG image at origin (no padding)
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to PNG data URI with quality 0.92
        const pngDataUri = canvas.toDataURL('image/png', 0.92);

        // Return the PNG and the SCALED metrics (since PNG is at scaled size)
        resolve({
          dataUri: pngDataUri,
          widthEx: scaledWidthEx,
          heightEx: scaledHeightEx,
          baselineEx: scaledBaselineEx
        });
      };

      img.onerror = function(e) {
        reject(new Error('Failed to convert SVG to PNG'));
      };

      img.src = svgDataUri;
    });

  } catch (error) {
    console.error('TeX rendering failed:', error);
    throw error;
  }
};

// Export for use in other modules
if (typeof module !== 'undefined') {
  module.exports = TexRenderer;
} else if (typeof window !== 'undefined') {
  window.TexRenderer = TexRenderer;
}

})();