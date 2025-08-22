/*
 * Copyright Adam Pritchard 2013
 * MIT License : https://adampritchard.mit-license.org/
 */

document.addEventListener('DOMContentLoaded', function() {
  // Add event listeners to log test names before running
  var runner = mocha
    // I'm not sure what introduces the global "schemaTypes", but it's not
    // Markdown Here and it causes an error on one of my Chrome instances.
    .globals([ 'schemaTypes' ]) // acceptable globals
    .run();
  
  // Log suite names when they start
  runner.on('suite', function(suite) {
    if (suite.title) {
      console.log('\n=== Suite:', suite.title, '===');
    }
  });
  
  // Log test names before they run
  runner.on('test', function(test) {
    console.log('  → Running:', test.fullTitle());
  });
});
