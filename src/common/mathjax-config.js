/*
 * Copyright Adam Pritchard 2025
 * MIT License : https://adampritchard.mit-license.org/
 */

/*
 * MathJax configuration - must be loaded BEFORE mathjax-tex-svg-full.js
 */

;(function() {
  'use strict';

  // Set up MathJax configuration before MathJax loads
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']],
      processEscapes: false,
      processEnvironments: true,
      processRefs: true
    },
    svg: {
      fontCache: 'none',
      scale: 1.4,  // Increased scale for better base size
      minScale: 0.5
    },
    startup: {
      typeset: false,  // We'll manually call tex2svg
      pageReady: function() {
        // This runs when MathJax is fully loaded
        console.log('[MathJax Config] MathJax is ready');
        console.log('[MathJax Config] Available methods:', {
          tex2svg: typeof MathJax.tex2svg,
          tex2chtml: typeof MathJax.tex2chtml,
          tex2mml: typeof MathJax.tex2mml,
          startup: typeof MathJax.startup,
          version: MathJax.version
        });

        // Check if we need to explicitly set up tex2svg
        if (!MathJax.tex2svg && MathJax.startup && MathJax.startup.input && MathJax.startup.output) {
          console.log('[MathJax Config] Setting up tex2svg manually...');
          try {
            // Try to create tex2svg function manually
            MathJax.tex2svg = function(tex, options) {
              const input = MathJax.startup.input[0];
              const output = MathJax.startup.output;
              const doc = MathJax.startup.document;

              // Convert TeX to MathML
              const math = input.compile(tex, doc);
              const mathNode = math.typesetRoot;

              // Convert to SVG
              return output.typeset(mathNode, doc);
            };
            console.log('[MathJax Config] tex2svg function created manually');
          } catch (e) {
            console.error('[MathJax Config] Failed to create tex2svg:', e);
          }
        }

        return MathJax.startup.defaultPageReady();
      }
    }
  };

  console.log('[MathJax Config] Configuration set');
})();