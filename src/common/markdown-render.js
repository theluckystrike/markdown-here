/*
 * Copyright Adam Pritchard 2013
 * MIT License : https://adampritchard.mit-license.org/
 */

/*
 * The function that does the basic raw-Markdown-in-HTML to rendered-HTML
 * conversion.
 * The reason we keep this function -- specifically, the function that uses our
 * external markdown renderer (marked.js), text-from-HTML module (jsHtmlToText.js),
 * and CSS -- separate is that it allows us to keep the bulk of the rendering
 * code (and the bulk of the code in our extension) out of the content script.
 * That way, we minimize the amount of code that needs to be loaded in every page.
 */

;(function() {

"use strict";
/*global module:false*/

var MarkdownRender = {};


/**
 Using the functionality provided by the functions htmlToText and markdownToHtml,
 render html into pretty text.
 */
function markdownRender(mdText, userprefs, marked, hljs) {
  function mathify(mathcode, isBlock) {
    // isBlock is true for $$...$$ math, false/undefined for $...$ inline math
    const blockClass = isBlock ? 'tex-block' : 'tex-inline';
    
    // Check if clipboard rendering (experimental feature) is enabled
    if (userprefs['clipboard-rendering-enabled']) {
      // Use local rendering with MathJax - create placeholder for clipboard-renderer
      // The actual dimensions and baseline will be set by clipboard-renderer after MathJax processing
      // For now, use reasonable defaults that will be replaced
      const style = isBlock 
        ? 'height:3em;width:auto;vertical-align:-1em;display:inline-block'
        : 'height:1.5em;width:auto;vertical-align:-0.4em;display:inline-block';
      return '<img data-math-formula="' + encodeURIComponent(mathcode) + 
             '" data-math-display="' + (isBlock ? 'block' : 'inline') + '"' +
             ' src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" ' +
             'alt="' + mathcode + '" ' +
             'style="' + style + '" ' +
             'class="math-formula-placeholder ' + blockClass + '">';
    } else {
      // Default: Use remote rendering with user's template (typically CodeCogs)
      // Add appropriate class for CSS targeting
      let result = userprefs['math-value']
              .replace(/\{mathcode\}/ig, mathcode)
              .replace(/\{urlmathcode\}/ig, encodeURIComponent(mathcode));
      
      // Add appropriate class if not already present
      if (result.indexOf('class=') === -1) {
        // No class attribute, add one
        result = result.replace(/<img/, '<img class="' + blockClass + '"');
      } else {
        // Has class attribute, append to it
        result = result.replace(/class="([^"]*)"/, 'class="$1 ' + blockClass + '"');
      }
      
      return result;
    }
  }

  // Hook into some of Marked's renderer customizations
  var markedRenderer = new marked.Renderer();
  
  // Override all block element renderers to remove trailing newlines
  // This prevents Gmail from inserting ZeroWidthSpace characters that create blank lines
  
  markedRenderer.paragraph = function(text) {
    return '<p>' + text + '</p>';
  };
  
  markedRenderer.blockquote = function(quote) {
    return '<blockquote>' + quote + '</blockquote>';
  };
  
  markedRenderer.html = function(html) {
    return html;
  };
  
  markedRenderer.hr = function() {
    return '<hr>';
  };
  
  markedRenderer.list = function(body, ordered) {
    var type = ordered ? 'ol' : 'ul';
    return '<' + type + '>' + body + '</' + type + '>';
  };
  
  markedRenderer.listitem = function(text) {
    return '<li>' + text + '</li>';
  };
  
  markedRenderer.table = function(header, body) {
    return '<table>' +
      '<thead>' + header + '</thead>' +
      '<tbody>' + body + '</tbody>' +
      '</table>';
  };
  
  markedRenderer.tablerow = function(content) {
    return '<tr>' + content + '</tr>';
  };
  
  markedRenderer.tablecell = function(content, flags) {
    var type = flags.header ? 'th' : 'td';
    var tag = flags.align
      ? '<' + type + ' style="text-align:' + flags.align + '">'
      : '<' + type + '>';
    return tag + content + '</' + type + '>';
  };
  
  // Override code renderer to remove trailing newline but preserve internal structure
  markedRenderer.code = function(code, lang, escaped) {
    // Apply highlighting just like the original marked renderer does
    if (this.options.highlight) {
      var out = this.options.highlight(code, lang);
      if (out != null && out !== code) {
        escaped = true;
        code = out;
      }
    }
    
    if (!lang) {
      return '<pre><code>' + (escaped ? code : escape(code, true)) + '\n</code></pre>';
    }
    
    return '<pre><code class="' + this.options.langPrefix + escape(lang, true) + '">' +
           (escaped ? code : escape(code, true)) +
           '\n</code></pre>';
  };
  
  // Helper function for escaping (copied from marked.js)
  function escape(html, encode) {
    return html
      .replace(!encode ? /&(?!#?\w+;)/g : /&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var sanitizeLinkForAnchor = function(text) {
    return text.toLowerCase().replace(/[^\w]+/g, '-');
  };

  // Override the heading renderer to remove newlines and handle anchors
  markedRenderer.heading = function (text, level, raw) {
    if (userprefs['header-anchors-enabled']) {
      // Add an anchor right above the heading. See MDH issue #93.
      var sanitizedText = sanitizeLinkForAnchor(text);
      var anchorLink = '<a href="#" name="' + sanitizedText + '"></a>';
      return '<h' + level + '>' +
             anchorLink +
             text +
             '</h' + level + '>';
    }
    else {
      // Standard heading without trailing newline
      return '<h' + level + '>' + text + '</h' + level + '>';
    }
  };

  var defaultLinkRenderer = markedRenderer.link;
  markedRenderer.link = function(href, title, text) {
    // Added to fix MDH issue #57: MD links should automatically add scheme.
    // Note that the presence of a ':' is used to indicate a scheme, so port
    // numbers will defeat this.
    href = href.replace(/^(?!#)([^:]+)$/, 'https://$1');

    if (userprefs['header-anchors-enabled']) {
      // Add an anchor right above the heading. See MDH issue #93.
      if (href.indexOf('#') === 0) {
        href = '#' + sanitizeLinkForAnchor(href.slice(1).toLowerCase());
      }
    }

    return defaultLinkRenderer.call(this, href, title, text);
  };

  var markedOptions = {
    renderer: markedRenderer,
    gfm: true,
    pedantic: false,
    sanitize: false,
    tables: true,
    smartLists: true,
    breaks: userprefs['gfm-line-breaks-enabled'],
    smartypants: true,
    // Bit of a hack: highlight.js uses a `hljs` class to style the code block,
    // so we'll add it by sneaking it into this config field.
    langPrefix: 'hljs language-',
    math: userprefs['math-enabled'] ? mathify : null,
    highlight: function(codeText, codeLanguage) {
        if (codeLanguage &&
            hljs.getLanguage(codeLanguage.toLowerCase())) {
          return hljs.highlight(codeText, {language: codeLanguage.toLowerCase(), ignoreIllegals: true}).value;
        }

        return codeText;
      }
    };

  var renderedMarkdown = marked(mdText, markedOptions);

  return renderedMarkdown;
}


// Expose these functions

MarkdownRender.markdownRender = markdownRender;

var EXPORTED_SYMBOLS = ['MarkdownRender'];

if (typeof module !== 'undefined') {
  module.exports = MarkdownRender;
} else {
  this.MarkdownRender = MarkdownRender;
  this.EXPORTED_SYMBOLS = EXPORTED_SYMBOLS;
}

}).call(function() {
  return this || (typeof window !== 'undefined' ? window : global);
}());
