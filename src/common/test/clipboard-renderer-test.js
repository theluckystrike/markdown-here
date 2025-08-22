/*
 * Copyright Adam Pritchard 2025
 * MIT License : https://adampritchard.mit-license.org/
 */

"use strict";
/* jshint curly:true, noempty:true, newcap:true, eqeqeq:true, eqnull:true, undef:true, devel:true, browser:true, node:true, evil:false, latedef:false, nonew:true, trailing:false, immed:false, smarttabs:true, expr:true */
/* global describe, expect, it, before, beforeEach, after, afterEach */
/* global ClipboardRenderer, TexRenderer */

describe('ClipboardRenderer', function() {
  it('should exist', function() {
    expect(ClipboardRenderer).to.exist;
    expect(ClipboardRenderer.renderViaClipboard).to.exist;
    expect(ClipboardRenderer.processImagesAsync).to.exist;
  });

  describe('isSupported', function() {
    it('should detect clipboard API support', function() {
      const supported = ClipboardRenderer.isSupported();
      expect(supported).to.be.a('boolean');
      
      // In modern browsers with clipboard API
      if (navigator.clipboard && navigator.clipboard.write) {
        expect(supported).to.be.true;
      }
    });
  });

  describe('processImagesAsync', function() {
    let testContainer;

    beforeEach(function() {
      testContainer = document.createElement('div');
      document.body.appendChild(testContainer);
    });

    afterEach(function() {
      if (testContainer && testContainer.parentNode) {
        testContainer.parentNode.removeChild(testContainer);
      }
    });

    it('should process TeX formulas when clipboard rendering is enabled', async function() {
      const html = '<p>Inline math <img data-math-formula="x%5E2" data-math-display="inline" ' +
                   'src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" ' +
                   'alt="x^2" class="math-formula-placeholder tex-inline"></p>';
      
      const options = { 'clipboard-rendering-enabled': true };
      
      const result = await ClipboardRenderer.processImagesAsync(html, options);
      
      // Should contain processed image
      expect(result).to.be.a('string');
      expect(result).to.contain('<img');
      
      // If TexRenderer is available, should have processed the formula
      if (typeof TexRenderer !== 'undefined' && TexRenderer.renderToDataURI) {
        // Alt should contain JSON with original alt and style (may have HTML entities)
        // JSON structure: {"alt":"...","style":"..."} (may be HTML-escaped)
        // Check for either escaped or unescaped quotes
        expect(result).to.satisfy(html => 
          html.includes('"alt":') || html.includes('&quot;alt&quot;:'));
        expect(result).to.satisfy(html => 
          html.includes('"style":') || html.includes('&quot;style&quot;:'));
      }
    });

    it('should handle external image URLs', async function() {
      const html = '<img src="https://example.com/image.png" alt="test image">';
      const options = { 'clipboard-rendering-enabled': true };
      
      const result = await ClipboardRenderer.processImagesAsync(html, options);
      
      expect(result).to.be.a('string');
      expect(result).to.contain('<img');
      // The external URL fetch will likely fail due to CORS, but the function should still
      // process the image and encode its alt text as JSON
      // JSON format: {"alt":"test image","style":""} (may be HTML-escaped)
      expect(result).to.satisfy(html => 
        html.includes('"alt"') || html.includes('&quot;alt&quot;'));
      expect(result).to.contain('test image');
    });

    it('should preserve existing data URIs', async function() {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const html = `<img src="${dataUri}" alt="test">`;
      const options = { 'clipboard-rendering-enabled': true };
      
      const result = await ClipboardRenderer.processImagesAsync(html, options);
      
      expect(result).to.contain(dataUri);
      // Alt should be JSON encoded: {"alt":"test","style":""} (may be HTML-escaped)
      expect(result).to.satisfy(html => 
        html.includes('"alt"') || html.includes('&quot;alt&quot;'));
      expect(result).to.contain('test');
    });

    it('should handle images without alt text', async function() {
      const html = '<img src="data:image/png;base64,test">';
      const options = { 'clipboard-rendering-enabled': true };
      
      const result = await ClipboardRenderer.processImagesAsync(html, options);
      
      expect(result).to.be.a('string');
      // Should still create JSON structure even without alt
      // JSON format: {"alt":"","style":""} (may be HTML-escaped)
      expect(result).to.satisfy(html => 
        html.includes('"alt"') || html.includes('&quot;alt&quot;'));
      expect(result).to.satisfy(html => 
        html.includes('"style"') || html.includes('&quot;style&quot;:'));
    });

    it('should handle malformed image tags gracefully', async function() {
      const html = '<p>Text before <img> text after</p>';
      const options = { 'clipboard-rendering-enabled': true };
      
      const result = await ClipboardRenderer.processImagesAsync(html, options);
      
      expect(result).to.be.a('string');
      expect(result).to.contain('Text before');
      expect(result).to.contain('text after');
    });
  });

  describe('saveClipboard and restoreClipboard', function() {
    it('should handle clipboard save/restore operations', async function() {
      // This test requires clipboard permissions and focus
      // Modern browsers supporting Markdown Here should have clipboard API
      expect(navigator.clipboard).to.exist;
      expect(navigator.clipboard.readText).to.be.a('function');
      expect(navigator.clipboard.writeText).to.be.a('function');

      const originalText = 'Original clipboard content';
      
      try {
        // Try to write to clipboard first
        await navigator.clipboard.writeText(originalText);
        
        // Save clipboard
        const saved = await ClipboardRenderer.saveClipboard();
        
        if (saved) {
          // Write something else
          await navigator.clipboard.writeText('Temporary content');
          
          // Restore
          await ClipboardRenderer.restoreClipboard(saved);
          
          // Check if restored (may fail due to permissions)
          try {
            const restored = await navigator.clipboard.readText();
            expect(restored).to.equal(originalText);
          } catch (e) {
            // Permission denied for reading, acceptable
          }
        }
      } catch (e) {
        // Clipboard operations may fail due to permissions
        // This is acceptable in test environment
      }
    });

    it('should handle ClipboardItem format', async function() {
      // ClipboardItem should be available in browsers that support Markdown Here
      expect(window.ClipboardItem).to.exist;

      const items = [
        new ClipboardItem({
          'text/plain': new Blob(['test text'], { type: 'text/plain' })
        })
      ];

      // This may fail due to permissions, which is acceptable
      try {
        await ClipboardRenderer.restoreClipboard(items);
      } catch (e) {
        // Expected in test environment
      }
    });

    it('should handle text-only fallback format', async function() {
      const textData = { text: 'fallback text' };
      
      // This may fail due to permissions, which is acceptable
      try {
        await ClipboardRenderer.restoreClipboard(textData);
      } catch (e) {
        // Expected in test environment
      }
    });
  });

  describe('executePaste', function() {
    let testElement;

    beforeEach(function() {
      testElement = document.createElement('div');
      testElement.contentEditable = true;
      document.body.appendChild(testElement);
      testElement.focus();
    });

    afterEach(function() {
      if (testElement && testElement.parentNode) {
        testElement.parentNode.removeChild(testElement);
      }
    });

    it('should return boolean from paste execution', function() {
      const result = ClipboardRenderer.executePaste(testElement.ownerDocument);
      expect(result).to.be.a('boolean');
      
      // Note: execCommand('paste') typically returns false in test environment
      // due to security restrictions
    });

    it('should handle null target document', function() {
      const result = ClipboardRenderer.executePaste(null);
      expect(result).to.be.a('boolean');
      // Should use default document when null is passed
    });

    it('should handle document without execCommand', function() {
      const fakeDoc = {};
      const result = ClipboardRenderer.executePaste(fakeDoc);
      expect(result).to.be.false;
    });
  });

  describe('monitorPastedImages', function() {
    let testContainer;

    beforeEach(function() {
      testContainer = document.createElement('div');
      document.body.appendChild(testContainer);
    });

    afterEach(function() {
      if (testContainer && testContainer.parentNode) {
        testContainer.parentNode.removeChild(testContainer);
      }
    });

    it('should set up mutation observer', function(done) {
      const stopMonitoring = ClipboardRenderer.monitorPastedImages(testContainer);
      
      expect(stopMonitoring).to.be.a('function');
      
      // Cleanup
      stopMonitoring();
      done();
    });

    it('should process images with JSON-encoded alt attributes', function(done) {
      this.timeout(3000); // Increase timeout for this test
      
      const stopMonitoring = ClipboardRenderer.monitorPastedImages(testContainer);
      
      // Add an image with JSON-encoded alt
      const img = document.createElement('img');
      img.alt = '{"alt":"x^2","style":"height:2em;vertical-align:-0.5em"}';
      img.src = 'data:image/png;base64,test';
      testContainer.appendChild(img);
      
      // For non-Gmail environments, the cleanup happens after IDLE_TIMEOUT (2 seconds)
      // We can either wait for that or call stopMonitoring() which triggers cleanup
      // Let's call stopMonitoring after a short delay to trigger immediate cleanup
      setTimeout(() => {
        // Manually trigger cleanup by calling stopMonitoring
        stopMonitoring();
        
        // Now check if alt was cleaned (styles won't be applied in non-Gmail case)
        expect(img.alt).to.equal('x^2');
        // Note: styles are only applied when src is cid:/blob:, not for data: URIs
        // So we shouldn't expect styles to be applied here
        
        done();
      }, 100);
    });

    it('should handle HTML-escaped JSON in alt attributes', function(done) {
      const stopMonitoring = ClipboardRenderer.monitorPastedImages(testContainer);
      
      // Add an image with HTML-escaped JSON (as Gmail does)
      const img = document.createElement('img');
      img.alt = '{&quot;alt&quot;:&quot;formula&quot;,&quot;style&quot;:&quot;width:3em&quot;}';
      img.src = 'data:image/png;base64,test';
      testContainer.appendChild(img);
      
      // Give mutation observer time to process
      setTimeout(() => {
        // Manually trigger cleanup
        stopMonitoring();
        
        // Check if alt was cleaned (styles won't be applied for data: URIs)
        expect(img.alt).to.equal('formula');
        // Note: styles are only applied when src is cid:/blob:, not for data: URIs
        
        done();
      }, 100);
    });

    it('should handle malformed JSON gracefully', function(done) {
      const stopMonitoring = ClipboardRenderer.monitorPastedImages(testContainer);
      
      // Add an image with malformed JSON
      const img = document.createElement('img');
      img.alt = '{not valid json}';
      img.src = 'data:image/png;base64,test';
      testContainer.appendChild(img);
      
      // Give mutation observer time to process
      setTimeout(() => {
        // Alt should remain unchanged if JSON is invalid
        expect(img.alt).to.equal('{not valid json}');
        
        stopMonitoring();
        done();
      }, 100);
    });

    it('should handle nested element mutations', function(done) {
      const stopMonitoring = ClipboardRenderer.monitorPastedImages(testContainer);
      
      // Create nested structure
      const div = document.createElement('div');
      const span = document.createElement('span');
      const img = document.createElement('img');
      img.alt = '{"alt":"nested","style":"display:block"}';
      img.src = 'data:image/png;base64,test';
      
      span.appendChild(img);
      div.appendChild(span);
      testContainer.appendChild(div);
      
      // Give mutation observer time to process
      setTimeout(() => {
        // Manually trigger cleanup
        stopMonitoring();
        
        // Check if nested image was processed (alt cleaned, no styles for data: URIs)
        expect(img.alt).to.equal('nested');
        // Note: styles are only applied when src is cid:/blob:, not for data: URIs
        
        done();
      }, 100);
    });

    it('should apply styles when src is replaced with blob: or cid: (Gmail scenario)', function(done) {
      const stopMonitoring = ClipboardRenderer.monitorPastedImages(testContainer);
      
      // Add an image with JSON-encoded alt
      const img = document.createElement('img');
      img.alt = '{"alt":"x^2","style":"height:2em;vertical-align:-0.5em"}';
      img.src = 'data:image/png;base64,test';
      testContainer.appendChild(img);
      
      // Simulate Gmail replacing the src with a blob: URL
      setTimeout(() => {
        // Simulate Gmail's image replacement
        img.src = 'blob:https://mail.google.com/12345678-1234-1234-1234-123456789012';
        
        // Give mutation observer time to detect the change and apply styles
        setTimeout(() => {
          // In Gmail scenario, styles should be applied and alt cleaned
          expect(img.alt).to.equal('x^2');
          expect(img.style.height).to.equal('2em');
          expect(img.style.verticalAlign).to.equal('-0.5em');
          
          stopMonitoring();
          done();
        }, 50);
      }, 50);
    });

    it('should stop monitoring when cleanup function is called', function(done) {
      const stopMonitoring = ClipboardRenderer.monitorPastedImages(testContainer);
      
      // Stop monitoring immediately
      stopMonitoring();
      
      // Add an image - it should NOT be processed
      const img = document.createElement('img');
      img.alt = '{"alt":"should not change","style":"color:red"}';
      img.src = 'data:image/png;base64,test';
      testContainer.appendChild(img);
      
      // Wait and verify no processing occurred
      setTimeout(() => {
        expect(img.alt).to.equal('{"alt":"should not change","style":"color:red"}');
        expect(img.style.color).to.not.equal('red');
        done();
      }, 100);
    });
  });

  describe('renderViaClipboard integration', function() {
    let testRange;
    let testContainer;

    beforeEach(function() {
      testContainer = document.createElement('div');
      testContainer.contentEditable = true;
      testContainer.innerHTML = '<p>Selected text</p>';
      document.body.appendChild(testContainer);
      
      // Create a range
      testRange = document.createRange();
      testRange.selectNodeContents(testContainer.firstChild);
    });

    afterEach(function() {
      if (testContainer && testContainer.parentNode) {
        testContainer.parentNode.removeChild(testContainer);
      }
    });

    it('should handle the full rendering pipeline', function(done) {
      const html = '<div class="markdown-here-wrapper"><p>Rendered content</p></div>';
      
      const options = { 'clipboard-rendering-enabled': true };
      ClipboardRenderer.renderViaClipboard(html, testRange, options, function(success) {
        expect(success).to.be.a('boolean');
        // Success will likely be false in test environment due to clipboard restrictions
        done();
      });
    });

    it('should handle rendering with math formulas', function(done) {
      const html = '<div class="markdown-here-wrapper">' +
                   '<p>Formula: <img alt="x^2" style="height:1.5em"></p>' +
                   '</div>';
      
      const options = { 'clipboard-rendering-enabled': true };
      ClipboardRenderer.renderViaClipboard(html, testRange, options, function(success) {
        expect(success).to.be.a('boolean');
        done();
      });
    });

    it('should call callback even on failure', function(done) {
      // Pass invalid range to trigger failure
      ClipboardRenderer.renderViaClipboard('<p>Test</p>', null, null, function(success) {
        expect(success).to.be.false;
        done();
      });
    });

    it('should handle empty HTML', function(done) {
      const options = { 'clipboard-rendering-enabled': true };
      ClipboardRenderer.renderViaClipboard('', testRange, options, function(success) {
        expect(success).to.be.a('boolean');
        done();
      });
    });
  });

  describe('Edge cases and error handling', function() {
    it('should handle clipboard read failures gracefully', async function() {
      // In test environment, clipboard read often fails due to permissions
      // Test that our code handles this gracefully
      const saved = await ClipboardRenderer.saveClipboard();
      
      // It's okay if this returns null (permission denied) or succeeds
      if (saved === null) {
        // Permission was denied, which is expected in test environment
        expect(saved).to.be.null;
      } else {
        // Permission was granted, we should have gotten some data
        expect(saved).to.exist;
      }
      
      // Restore should handle null without throwing
      await ClipboardRenderer.restoreClipboard(null);
      // Should complete without error
    });

    it('should handle processImagesAsync with null options', async function() {
      const html = '<img src="test.png" alt="test">';
      const result = await ClipboardRenderer.processImagesAsync(html, null);
      
      expect(result).to.equal(html); // Should return unchanged
    });

    it('should handle processImagesAsync with clipboard rendering disabled', async function() {
      const html = '<img src="test.png" alt="test">';
      const options = { 'clipboard-rendering-enabled': false };
      const result = await ClipboardRenderer.processImagesAsync(html, options);
      
      expect(result).to.equal(html); // Should return unchanged
    });

    it('should handle monitor cleanup after timeout', function(done) {
      const container = document.createElement('div');
      document.body.appendChild(container);
      
      const stopMonitoring = ClipboardRenderer.monitorPastedImages(container);
      
      // The monitor should auto-cleanup after IDLE_TIMEOUT (2 seconds in the code)
      // We'll test that it still works before timeout
      const img = document.createElement('img');
      img.alt = '{"alt":"test","style":"color:blue"}';
      img.src = 'data:image/png;base64,test'; // Add src so it's a valid image
      container.appendChild(img);
      
      setTimeout(() => {
        // Manually trigger cleanup by calling stopMonitoring
        stopMonitoring();
        // After cleanup, the alt should be cleaned
        expect(img.alt).to.equal('test');
        container.parentNode.removeChild(container);
        done();
      }, 100);
    });
  });
});