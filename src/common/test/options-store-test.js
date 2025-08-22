/*
 * Copyright Adam Pritchard 2013
 * MIT License : https://adampritchard.mit-license.org/
 */

"use strict";
/* jshint curly:true, noempty:true, newcap:true, eqeqeq:true, eqnull:true, es5:true, undef:true, devel:true, browser:true, node:true, evil:false, latedef:false, nonew:true, trailing:false, immed:false, smarttabs:true, expr:true */
/* global describe, expect, it, before, beforeEach, after, afterEach */
/* global _, $, markdownRender, htmlToText, marked, hljs, Utils, OptionsStore */


describe('OptionsStore', function() {
  it('should exist', function() {
    expect(OptionsStore).to.exist;
  });

  var testKeys = ['test-option-a', 'test-option-b'];

  beforeEach(function(done) {
    OptionsStore.remove(testKeys, function() {
      done();
    });
  });

  after(function(done) {
    OptionsStore.remove(testKeys, function() {
      done();
    });
  });

  it('should call callback after getting', function(done) {
    OptionsStore.get(function() {
      done();
    });
  });

  it('should call callback after setting', function(done) {
    OptionsStore.set({}, function() {
      done();
    });
  });

  it('should call callback after removing', function(done) {
    OptionsStore.remove([], function() {
      done();
    });
  });

  it('should set and get null values', function(done) {
    OptionsStore.get(function(options) {
      expect(options).to.not.have.property(testKeys[0]);

      var obj = {};
      obj[testKeys[0]] = null;

      OptionsStore.set(obj, function() {
        OptionsStore.get(function(newOptions) {
          expect(newOptions).to.have.property(testKeys[0]);
          expect(newOptions[testKeys[0]]).to.be.null;
          done();
        });
      });
    });
  });

  it('should set and get long values', function(done) {
    var longString = (new Array(10*1024)).join('x');

    var obj = {};
    obj[testKeys[0]] = longString;

    OptionsStore.set(obj, function() {
      OptionsStore.get(function(newOptions) {
        expect(newOptions).to.have.property(testKeys[0]);
        expect(newOptions[testKeys[0]]).to.equal(longString);
        done();
      });
    });
  });

  it('should set and get objects', function(done) {
    OptionsStore.get(function(options) {
      expect(options).to.not.have.property(testKeys[0]);

      var obj = {};
      obj[testKeys[0]] = {
        'aaa': 111,
        'bbb': 'zzz',
        'ccc': ['q', 'w', 3, 4],
        'ddd': {'mmm': 'nnn'}
      };

      OptionsStore.set(obj, function() {
        OptionsStore.get(function(newOptions) {
          expect(newOptions).to.have.property(testKeys[0]);
          expect(newOptions[testKeys[0]]).to.eql(obj[testKeys[0]]);
          done();
        });
      });
    });
  });

  it('should set and get arrays', function(done) {
    OptionsStore.get(function(options) {
      expect(options).to.not.have.property(testKeys[0]);

      var obj = {};
      obj[testKeys[0]] = [1, 2, 'a', 'b', {'aa': 11}, ['q', 6]];

      OptionsStore.set(obj, function() {
        OptionsStore.get(function(newOptions) {
          expect(newOptions).to.have.property(testKeys[0]);
          expect(newOptions[testKeys[0]]).to.eql(obj[testKeys[0]]);
          expect(Array.isArray(newOptions[testKeys[0]])).to.be.true;
          expect(newOptions[testKeys[0]]).to.have.property('length');

          done();
        });
      });
    });
  });

  it('should remove entries', function(done) {
    OptionsStore.get(function(options) {
      expect(options).to.not.have.property(testKeys[0]);

      var obj = {};
      obj[testKeys[0]] = 'hi';

      OptionsStore.set(obj, function() {
        OptionsStore.get(function(newOptions) {
          expect(newOptions).to.have.property(testKeys[0]);
          expect(newOptions[testKeys[0]]).to.eql(obj[testKeys[0]]);

          OptionsStore.remove(testKeys[0], function() {
            OptionsStore.get(function(newOptions) {
              expect(options).to.not.have.property(testKeys[0]);
              done();
            });
          });
        });
      });
    });
  });

  // Test new clipboard-rendering-enabled option
  describe('clipboard-rendering-enabled option', function() {
    var clipboardKey = 'clipboard-rendering-enabled';
    var userOriginalValue = undefined;
    
    // Save user's original value before running tests
    before(function(done) {
      OptionsStore.get(function(options) {
        // Store whatever value the user has (undefined if never set, false by default, or true if enabled)
        userOriginalValue = options[clipboardKey];
        done();
      });
    });
    
    // Restore user's original value after all tests complete
    after(function(done) {
      // Always restore the user's original value
      var obj = {};
      obj[clipboardKey] = userOriginalValue;
      OptionsStore.set(obj, function() {
        done();
      });
    });

    it('should set and get clipboard-rendering-enabled', function(done) {
      var obj = {};
      obj[clipboardKey] = true;

      OptionsStore.set(obj, function() {
        OptionsStore.get(function(options) {
          expect(options[clipboardKey]).to.equal(true);
          done();
        });
      });
    });

    it('should persist clipboard-rendering-enabled across get calls', function(done) {
      var obj = {};
      obj[clipboardKey] = true;

      OptionsStore.set(obj, function() {
        // First get
        OptionsStore.get(function(options1) {
          expect(options1[clipboardKey]).to.equal(true);
          
          // Second get to ensure persistence
          OptionsStore.get(function(options2) {
            expect(options2[clipboardKey]).to.equal(true);
            done();
          });
        });
      });
    });

    it('should handle toggling clipboard-rendering-enabled', function(done) {
      var obj = {};
      
      // Set to true
      obj[clipboardKey] = true;
      OptionsStore.set(obj, function() {
        OptionsStore.get(function(options) {
          expect(options[clipboardKey]).to.equal(true);
          
          // Toggle to false
          obj[clipboardKey] = false;
          OptionsStore.set(obj, function() {
            OptionsStore.get(function(options2) {
              expect(options2[clipboardKey]).to.equal(false);
              done();
            });
          });
        });
      });
    });


    it('should handle clipboard-rendering-enabled with other options', function(done) {
      // Save original values first
      var originalValues = {};
      var testKeys = ['clipboard-rendering-enabled', 'forgot-to-render-check-enabled-2', 'header-anchors-enabled', 'gfm-line-breaks-enabled'];
      
      OptionsStore.get(function(originalOptions) {
        // Store original values (might be undefined if not set)
        testKeys.forEach(function(key) {
          originalValues[key] = originalOptions[key];
        });
        
        // Now run the test with test values
        var obj = {
          'clipboard-rendering-enabled': true,
          'forgot-to-render-check-enabled-2': true,
          'header-anchors-enabled': true,
          'gfm-line-breaks-enabled': false
        };

        OptionsStore.set(obj, function() {
          OptionsStore.get(function(options) {
            expect(options['clipboard-rendering-enabled']).to.equal(true);
            expect(options['forgot-to-render-check-enabled-2']).to.equal(true);
            expect(options['header-anchors-enabled']).to.equal(true);
            expect(options['gfm-line-breaks-enabled']).to.equal(false);
            
            // Restore original values instead of removing
            // Only set keys that had original values
            var restoreObj = {};
            testKeys.forEach(function(key) {
              if (originalValues[key] !== undefined) {
                restoreObj[key] = originalValues[key];
              }
            });
            
            if (Object.keys(restoreObj).length > 0) {
              OptionsStore.set(restoreObj, function() {
                done();
              });
            } else {
              // If there were no original values, remove the test values
              OptionsStore.remove(testKeys, function() {
                done();
              });
            }
          });
        });
      });
    });
  });

  it('should set and get multiple values', function(done) {
    OptionsStore.get(function(options) {
      expect(options).to.not.have.property(testKeys[0]);

      var obj = {};
      obj[testKeys[0]] = 'value the first';
      obj[testKeys[1]] = ['value the second'];

      OptionsStore.set(obj, function() {
        OptionsStore.get(function(newOptions) {
          expect(newOptions).to.have.property(testKeys[0]);
          expect(newOptions[testKeys[0]]).to.eql(obj[testKeys[0]]);
          expect(newOptions).to.have.property(testKeys[1]);
          expect(newOptions[testKeys[1]]).to.eql(obj[testKeys[1]]);
          done();
        });
      });
    });
  });

  describe('default value behaviour', function() {
    beforeEach(function() {
      delete OptionsStore.defaults[testKeys[0]];
    });

    after(function() {
      delete OptionsStore.defaults[testKeys[0]];
    });

    it('should not fill in defaults if there is not a default', function(done) {
      OptionsStore.get(function(options) {
        expect(options).to.not.have.property(testKeys[0]);

        done();
      });
    });

    it('should fill in defaults', function(done) {
      OptionsStore.get(function(options) {
        expect(options).to.not.have.property(testKeys[0]);

        // Set the default value (still pretty hacky)
        OptionsStore.defaults[testKeys[0]] = 'my default value';

        // Make sure we get the default value now
        OptionsStore.get(function(options) {
          expect(options).to.have.property(testKeys[0]);
          expect(options[testKeys[0]]).to.eql('my default value');

          done();
        });
      });
    });

    it('should not fill in default if value is set', function(done) {
      OptionsStore.get(function(options) {
        expect(options).to.not.have.property(testKeys[0]);

        // Set the default value (still pretty hacky)
        OptionsStore.defaults[testKeys[0]] = 'my default value';

        var obj = {};
        obj[testKeys[0]] = 'my non-default value';

        // But also set the value in the options
        OptionsStore.set(obj, function() {
          // Make sure we do *not* get the default value now
          OptionsStore.get(function(options) {
            expect(options).to.have.property(testKeys[0]);
            expect(options[testKeys[0]]).to.eql('my non-default value');

            done();
          });
        });
      });
    });

    it('should fill in default values from files', function(done) {
      OptionsStore.get(function(options) {
        expect(options).to.not.have.property(testKeys[0]);

        // Set a default value that requires a XHR
        OptionsStore.defaults[testKeys[0]] = {'__defaultFromFile__': window.location.href};

        fetch(window.location.href)
          .then(response => response.text())
          .then(responseText => {
            OptionsStore.get(function(options) {
              expect(options).to.have.property(testKeys[0]);
              expect(options[testKeys[0]]).to.eql(responseText);
              done();
            });
          });
      });
    });

    it('should upgrade defunct values to new default', function(done) {
      // Set our old math-value default, which we're replacing
      let obj = {'math-value': '<img src="https://chart.googleapis.com/chart?cht=tx&chl={urlmathcode}" alt="{mathcode}">'};
      OptionsStore.set(obj, function() {
        // Make sure we get the new default value instead of the defunct old one
        OptionsStore.get(function(options) {
          expect(options).to.have.property('math-value');
          expect(options['math-value']).to.contain('codecogs');
          done();
        });
      });
    });

  });

});
