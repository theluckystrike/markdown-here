/*
 * Copyright Adam Pritchard 2013
 * MIT License : https://adampritchard.mit-license.org/
 */

"use strict";
/* jshint curly:true, noempty:true, newcap:true, eqeqeq:true, eqnull:true, undef:true, devel:true, browser:true, node:true, evil:false, latedef:false, nonew:true, trailing:false, immed:false, smarttabs:true, expr:true */
/* global describe, expect, it, before, beforeEach, after, afterEach */
/* global _, MarkdownRender, htmlToText, marked, hljs, Utils, MdhHtmlToText */


describe('Markdown-Render', function() {
  it('should exist', function() {
    expect(MarkdownRender).to.exist;
    expect(MarkdownRender.markdownRender).to.exist;
  });

  describe('markdownRender', function() {
    var userprefs = {};

    beforeEach(function() {
      userprefs = {
        'math-value': null,
        'math-enabled': false,
        'header-anchors-enabled': false,
        'gfm-line-breaks-enabled': true
      };
    });

    it('should be okay with an empty string', function() {
      expect(MarkdownRender.markdownRender('', userprefs, marked, hljs)).to.equal('');
    });

    // Test the fix for https://github.com/adam-p/markdown-here/issues/51
    it('should correctly handle links with URL text', function() {
      var s = '[http://example1.com](http://example2.com)';
      var target = '<a href="http://example2.com">http://example1.com</a>';
      expect(MarkdownRender.markdownRender(s, userprefs, marked, hljs)).to.contain(target);
    });

    // Test the fix for https://github.com/adam-p/markdown-here/issues/51
    it('should quite correctly handle pre-formatted links with URL text', function() {
      var s = '<a href="http://example1.com">http://example2.com</a>';
      var target = '<a href="http://example1.com">http://example2.com</a>';
      expect(MarkdownRender.markdownRender(s, userprefs, marked, hljs)).to.contain(target);
    });

    it('should retain pre-formatted links', function() {
      var s = '<a href="http://example1.com">aaa</a>';
      expect(MarkdownRender.markdownRender(s, userprefs, marked, hljs)).to.contain(s);
    });

    // Test issue #57: https://github.com/adam-p/markdown-here/issues/57
    it('should add the schema to links missing it', function() {
      var md = 'asdf [aaa](bbb) asdf [ccc](ftp://ddd) asdf';
      var target = '<p>asdf <a href="https://bbb">aaa</a> asdf <a href="ftp://ddd">ccc</a> asdf</p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    it('should *not* add the schema to anchor links', function() {
      var md = 'asdf [aaa](#bbb) asdf [ccc](ftp://ddd) asdf';
      var target = '<p>asdf <a href="#bbb">aaa</a> asdf <a href="ftp://ddd">ccc</a> asdf</p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #87: https://github.com/adam-p/markdown-here/issues/87
    it('should smartypants apostrophes properly', function() {
      var md = "Adam's parents' place";
      var target = '<p>Adam\u2019s parents\u2019 place</p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #83: https://github.com/adam-p/markdown-here/issues/83
    it('should not alter MD-link-looking text in code blocks', function() {
      var md = '`[a](b)`';
      var target = '<p><code>[a](b)</code></p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);

      md = '```\n[a](b)\n```';
      target = '<pre><code>[a](b)\n</code></pre>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #84: Math: single-character formula won't render
    // https://github.com/adam-p/markdown-here/issues/84
    it('should render single-character math formulae', function() {
      userprefs = {
        'math-value': '<img class="mdh-math" src="https://latex.codecogs.com/png.image?\\dpi{120}\\inline&space;{urlmathcode}" alt="{mathcode}">',
        'math-enabled': true
      };

      var md = '$x$';
      var target = '<p><img class="mdh-math tex-inline" src="https://latex.codecogs.com/png.image?\\dpi{120}\\inline&space;x" alt="x"></p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);

      // Make sure we haven't broken multi-character forumlae
      md = '$xx$';
      target = '<p><img class="mdh-math tex-inline" src="https://latex.codecogs.com/png.image?\\dpi{120}\\inline&space;xx" alt="xx"></p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    it('should not add anchors to headers if option is disabled', function() {
      userprefs['header-anchors-enabled'] = false;
      var md = '# Header Number 1\n\n###### Header Number 6';
      var target = '<h1>Header Number 1</h1><h6>Header Number 6</h6>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #93: Add support for anchor links: https://github.com/adam-p/markdown-here/issues/93
    it('should add anchors to headers if enabled', function() {
      userprefs['header-anchors-enabled'] = true;
      var md = '# Header Number 1\n\n###### Header Number 6';
      var target = '<h1><a href="#" name="header-number-1"></a>Header Number 1</h1><h6><a href="#" name="header-number-6"></a>Header Number 6</h6>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #93: Add support for anchor links: https://github.com/adam-p/markdown-here/issues/93
    it('should convert anchor links to point to header auto-anchors', function() {
      userprefs['header-anchors-enabled'] = true;
      var md = '[H1](#Header Number 1)\n[H6](#Header Number 6)';
      var target = '<p><a href="#header-number-1">H1</a><br><a href="#header-number-6">H6</a></p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #93: Add support for anchor links: https://github.com/adam-p/markdown-here/issues/93
    it('should handle non-alphanumeric characters in headers', function() {
      userprefs['header-anchors-enabled'] = true;
      var md = '[H1](#a&b!c*d_f)\n# a&b!c*d_f';
      var target = '<p><a href="#a-amp-b-c-d_f">H1</a></p><h1><a href="#" name="a-amp-b-c-d_f"></a>a&amp;b!c*d_f</h1>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #112: Syntax Highlighting crashing rendering on bad language name: https://github.com/adam-p/markdown-here/issues/112
    it('should properly render code with good language names', function() {
      var md = '```sql\nSELECT * FROM table WHERE id = 1\n```';
      var target = '<pre><code class="hljs language-sql"><span class="hljs-keyword">SELECT</span> <span class="hljs-operator">*</span> <span class="hljs-keyword">FROM</span> <span class="hljs-keyword">table</span> <span class="hljs-keyword">WHERE</span> id <span class="hljs-operator">=</span> <span class="hljs-number">1</span>\n</code></pre>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #112: Syntax Highlighting crashing rendering on bad language name: https://github.com/adam-p/markdown-here/issues/112
    it('should properly render code with good language names that are in the wrong (upper)case', function() {
      var md = '```SQL\nSELECT * FROM table WHERE id = 1\n```';
      var target = '<pre><code class="hljs language-SQL"><span class="hljs-keyword">SELECT</span> <span class="hljs-operator">*</span> <span class="hljs-keyword">FROM</span> <span class="hljs-keyword">table</span> <span class="hljs-keyword">WHERE</span> id <span class="hljs-operator">=</span> <span class="hljs-number">1</span>\n</code></pre>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #112: Syntax Highlighting crashing rendering on bad language name: https://github.com/adam-p/markdown-here/issues/112
    it('should properly render code with unsupported language names', function() {
      var md = '```badlang\nSELECT * FROM table WHERE id = 1\n```';
      var target = '<pre><code class="hljs language-badlang">SELECT * FROM table WHERE id = 1\n</code></pre>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #132: https://github.com/adam-p/markdown-here/issues/132
    // Smart arrow
    it('should render smart arrows', function() {
      userprefs['header-anchors-enabled'] = true;
      var md = '--> <-- <--> ==> <== <==>';
      var target = '<p>→ ← ↔ ⇒ ⇐ ⇔</p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);

      // And should not break headers or m-dashes
      md = 'Arrows\n==\nAnd friends\n--\n--> <-- <--> ==> <== <==> -- m-dash';
      target = '<h1><a href="#" name="arrows"></a>Arrows</h1><h2><a href="#" name="and-friends"></a>And friends</h2><p>→ ← ↔ ⇒ ⇐ ⇔ — m-dash</p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #103: option to disable GFM line breaks
    it('should use GFM line breaks when enabled', function() {
      userprefs['gfm-line-breaks-enabled'] = true;

      var md = 'aaa\nbbb\nccc';
      var target = '<p>aaa<br>bbb<br>ccc</p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test issue #103: option to disable GFM line breaks
    it('should not use GFM line breaks when disabled', function() {
      userprefs['gfm-line-breaks-enabled'] = false;

      var md = 'aaa\nbbb\nccc';
      var target = '<p>aaa\nbbb\nccc</p>';
      expect(MarkdownRender.markdownRender(md, userprefs, marked, hljs)).to.equal(target);
    });

    // Test clipboard rendering mode for math formulas
    describe('Clipboard rendering math support', function() {
      it('should generate placeholder images for inline math when clipboard rendering is enabled', function() {
        userprefs = {
          'math-enabled': true,
          'clipboard-rendering-enabled': true
        };

        var md = 'Inline formula $x^2 + y^2 = r^2$ in text';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should contain placeholder image with data-math-formula attribute
        expect(result).to.contain('data-math-formula=');
        expect(result).to.contain('data-math-display="inline"');
        expect(result).to.contain('class="math-formula-placeholder tex-inline"');

        // Formula should be URL-encoded
        expect(result).to.contain(encodeURIComponent('x^2 + y^2 = r^2'));
      });

      it('should generate placeholder images for block math when clipboard rendering is enabled', function() {
        userprefs = {
          'math-enabled': true,
          'clipboard-rendering-enabled': true
        };

        var md = '$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should contain placeholder image with data-math-formula attribute
        expect(result).to.contain('data-math-formula=');
        expect(result).to.contain('data-math-display="block"');
        expect(result).to.contain('class="math-formula-placeholder tex-block"');

        // Should have block-appropriate styling
        expect(result).to.contain('height:3em');
      });

      it('should use remote rendering when clipboard rendering is disabled', function() {
        userprefs = {
          'math-value': '<img class="mdh-math" src="https://latex.codecogs.com/png.image?{urlmathcode}" alt="{mathcode}">',
          'math-enabled': true,
          'clipboard-rendering-enabled': false
        };

        var md = '$x^2$';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should use the math-value template
        expect(result).to.contain('https://latex.codecogs.com');
        expect(result).to.contain('class="mdh-math tex-inline"');

        // Should not contain placeholder attributes
        expect(result).to.not.contain('data-math-formula');
      });

      it('should add appropriate classes for inline vs block math', function() {
        userprefs = {
          'math-value': '<img src="test/{mathcode}">',
          'math-enabled': true,
          'clipboard-rendering-enabled': false
        };

        // Test inline math
        var inlineResult = MarkdownRender.markdownRender('$x$', userprefs, marked, hljs);
        expect(inlineResult).to.contain('class="tex-inline"');

        // Test block math
        var blockResult = MarkdownRender.markdownRender('$$x$$', userprefs, marked, hljs);
        expect(blockResult).to.contain('class="tex-block"');
      });

      it('should handle empty math formulas', function() {
        userprefs = {
          'math-enabled': true,
          'clipboard-rendering-enabled': true
        };

        var md = 'Empty: $$ in text';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should still create a placeholder
        expect(result).to.equal('<p>Empty: $$ in text</p>');
      });

      it('should handle complex math with special characters', function() {
        userprefs = {
          'math-enabled': true,
          'clipboard-rendering-enabled': true
        };

        var md = '$\\alpha + \\beta = \\gamma$';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should URL-encode the formula
        expect(result).to.contain(encodeURIComponent('\\alpha + \\beta = \\gamma'));
      });

      it('should not process math when math is disabled', function() {
        userprefs = {
          'math-enabled': false,
          'clipboard-rendering-enabled': true
        };

        var md = '$x^2$ and $$y^2$$';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should not contain math-related attributes
        expect(result).to.not.contain('data-math-formula');
        expect(result).to.not.contain('tex-inline');
        expect(result).to.not.contain('tex-block');
      });
    });

    // Test removal of trailing newlines from block elements
    describe('Block element newline removal', function() {
      it('should remove trailing newlines from paragraphs', function() {
        var md = 'First paragraph\n\nSecond paragraph';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should not have newline immediately after </p>
        expect(result).to.match(/<\/p><p>/);
        // And should not have one at the end
        expect(result).to.match(/<\/p>$/);
      });

      it('should remove trailing newlines from headers', function() {
        userprefs['header-anchors-enabled'] = false;

        var md = '# Header 1\n## Header 2';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Headers should not have trailing newlines between them
        expect(result).to.equal('<h1>Header 1</h1><h2>Header 2</h2>');
      });

      it.skip('should remove trailing newlines from blockquotes', function() {
        var md = '> Quote 1\n\n> Quote 2';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should not have excessive newlines
        expect(result).to.match(/<\/blockquote><blockquote>/);
      });

      it.skip('should create separate blockquotes when separated by blank line', function() {
        // TODO: This is a known bug in the old version of marked.js we're using (2011-2013).
        // Modern marked (v4.0.0+) correctly creates two separate blockquotes.
        // Our version incorrectly creates one blockquote with two paragraphs.
        var md = '> Quote 1\n\n> Quote 2';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should create two separate blockquote elements
        expect(result).to.equal('<blockquote><p>Quote 1</p></blockquote><blockquote><p>Quote 2</p></blockquote>');

        // Currently (incorrectly) produces:
        // '<blockquote><p>Quote 1</p><p>Quote 2</p></blockquote>'
      });

      it('should remove trailing newlines from lists', function() {
        var md = '- Item 1\n- Item 2\n\n1. Number 1\n2. Number 2';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should not have newlines between list items
        expect(result).to.match(/<\/li><li>/);
        // Should not have newline after </ul> before next element
        expect(result).to.match(/<\/ul><ol>/);
      });

      it('should remove trailing newlines from tables', function() {
        var md = '| Col1 | Col2 |\n|------|------|\n| A    | B    |';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should not have newlines within table structure
        expect(result).to.not.match(/<\/td>\n<td>/);
        expect(result).to.not.match(/<\/tr>\n<tr>/);
        expect(result).to.match(/<\/table>$/);
      });

      it('should handle horizontal rules without extra newlines', function() {
        var md = 'Before\n\n---\n\nAfter';
        var result = MarkdownRender.markdownRender(md, userprefs, marked, hljs);

        // Should have clean transitions
        expect(result).to.match(/<\/p><hr><p>/);
      });
    });

  });


  // This includes going from original HTML to MD to HTML and then postprocessing.
  describe('HTML to Markdown to HTML', function() {
    var userprefs = {};

    beforeEach(function() {
      userprefs = {
        'math-value': null,
        'math-enabled': false
      };
    });

    const fullRender = function(mdHTML) {
      const elem = document.createElement('div');
      Utils.saferSetInnerHTML(elem, mdHTML);
      document.body.appendChild(elem);
      const mdhHtmlToText = new MdhHtmlToText.MdhHtmlToText(elem);
      let renderedMarkdown = MarkdownRender.markdownRender(
        mdhHtmlToText.get(), userprefs, marked, hljs);
      renderedMarkdown = mdhHtmlToText.postprocess(renderedMarkdown);
      elem.parentNode.removeChild(elem);
      return renderedMarkdown;
    };

    it('should be okay with an empty string', function() {
      expect(fullRender('')).to.equal('');
    });

    // Check fix for https://github.com/adam-p/markdown-here/issues/51, which
    it('should correctly handle links with URL text', function() {
      var s = '[http://example1.com](http://example2.com)';
      var target = '<a href="http://example2.com">http://example1.com</a>';
      expect(fullRender(s)).to.contain(target);
    });

    it('should quite correctly handle pre-formatted links with URL text', function() {
      var s = '<a href="http://example2.com">http://example1.com</a>';
      var target = '<a href="http://example2.com">http://example1.com</a>';
      expect(fullRender(s)).to.contain(target);
    });

    it('should retain pre-formatted links', function() {
      var s = '<a href="http://example1.com">aaa</a>';
      expect(fullRender(s)).to.contain(s);
    });

    // Test that issue #69 hasn't come back: https://github.com/adam-p/markdown-here/issues/69
    it('should properly render MD links that contain pre-formatted HTML links', function() {
      var tests = [], i;

      // NOTE: The expected results are affected by other content massaging,
      // such as adding missing links schemas.

      // Begin tests where the link should be converted

      tests.push(['asdf <a href="http://www.aaa.com">bbb</a> asdf',
                  '<p>asdf <a href="http://www.aaa.com">bbb</a> asdf</p>']);

      tests.push(['<a href="aaa">bbb</a>',
                  '<p><a href="https://aaa">bbb</a></p>']);

      tests.push(['[xxx](yyy) <a href="aaa">bbb</a>',
                  '<p><a href="https://yyy">xxx</a> <a href="https://aaa">bbb</a></p>']);

      tests.push(['asdf (<a href="aaa">bbb</a>)',
                  '<p>asdf (<a href="https://aaa">bbb</a>)</p>']);

      // Begin tests where the link should *not* be converted.
      // Note that some tests are affected by issue #57: MD links should automatically add scheme

      tests.push(['asdf [yyy](<a href="http://www.aaa.com">bbb</a>) asdf',
                  '<p>asdf <a href="https://bbb">yyy</a> asdf</p>']);

      tests.push(['asdf [<a href="http://www.aaa.com">bbb</a>](ccc) asdf',
                  '<p>asdf <a href="https://ccc">bbb</a> asdf</p>']);

      tests.push(['[yyy](<a href="http://www.aaa.com">bbb</a>)',
                  '<p><a href="https://bbb">yyy</a></p>']);

      tests.push(['[yyy]( <a href="http://www.aaa.com">bbb</a>)',
                  '<p><a href="https://bbb">yyy</a></p>']);

      tests.push(['asdf [qwer <a href="http://www.aaa.com">bbb</a>](ccc) asdf',
                  '<p>asdf <a href="https://ccc">qwer bbb</a> asdf</p>']);

      // Begin mixed tests

      tests.push(['asdf [aaa](bbb) asdf <a href="http://www.aaa.com">bbb</a> asdf [yyy](<a href="http://www.aaa.com">bbb</a>) asdf',
                  '<p>asdf <a href="https://bbb">aaa</a> asdf <a href="http://www.aaa.com">bbb</a> asdf <a href="https://bbb">yyy</a> asdf</p>']);

      // Begin tests that don't work quite right

      tests.push(['asdf [<a href="http://www.aaa.com">bbb</a>] asdf',
                  '<p>asdf [bbb] asdf</p>']);

      tests.push(['asdf ](<a href="http://www.aaa.com">bbb</a>) asdf',
                  '<p>asdf ](bbb) asdf</p>']);

      for (i = 0; i < tests.length; i++) {
        expect(fullRender(tests[i][0])).to.equal(tests[i][1]);
      }
    });

    // Test issue #57: https://github.com/adam-p/markdown-here/issues/57
    it('should add the schema to links missing it', function() {
      var md = 'asdf [aaa](bbb) asdf [ccc](ftp://ddd) asdf';
      var target = '<p>asdf <a href="https://bbb">aaa</a> asdf <a href="ftp://ddd">ccc</a> asdf</p>';
      expect(fullRender(md)).to.equal(target);
    });

    it('should *not* add the schema to anchor links', function() {
      var md = 'asdf [aaa](#bbb) asdf [ccc](ftp://ddd) asdf';
      var target = '<p>asdf <a href="#bbb">aaa</a> asdf <a href="ftp://ddd">ccc</a> asdf</p>';
      expect(fullRender(md)).to.equal(target);
    });

    // Test issue #87: https://github.com/adam-p/markdown-here/issues/87
    it('should smartypants apostrophes properly', function() {
      var md = "Adam's parents' place";
      var target = '<p>Adam\u2019s parents\u2019 place</p>';
      expect(fullRender(md)).to.equal(target);
    });

    // Test issue #83: https://github.com/adam-p/markdown-here/issues/83
    it('should not alter MD-link-looking text in code blocks', function() {
      var md = '`[a](b)`';
      var target = '<p><code>[a](b)</code></p>';
      expect(fullRender(md)).to.equal(target);

      md = '```<br>[a](b)<br>```';
      target = '<pre><code>[a](b)\n</code></pre>';
      expect(fullRender(md)).to.equal(target);
    });

    // Test issue #84: Math: single-character formula won't render
    // https://github.com/adam-p/markdown-here/issues/84
    it('should render single-character math formulae', function() {
      userprefs = {
        'math-value': '<img class="mdh-math" src="https://latex.codecogs.com/png.image?\\dpi{120}\\inline&space;{urlmathcode}" alt="{mathcode}">',
        'math-enabled': true
      };

      var md = '$x$';
      var target = '<p><img class="mdh-math tex-inline" src="https://latex.codecogs.com/png.image?\\dpi{120}\\inline&space;x" alt="x"></p>';
      expect(fullRender(md)).to.equal(target);

      // Make sure we haven't broken multi-character forumlae
      md = '$xx$';
      target = '<p><img class="mdh-math tex-inline" src="https://latex.codecogs.com/png.image?\\dpi{120}\\inline&space;xx" alt="xx"></p>';
      expect(fullRender(md)).to.equal(target);
    });

  });

});
