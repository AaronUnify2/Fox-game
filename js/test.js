// test.js - Function to check if JavaScript is running

function testJavaScriptIsRunning() {
  // Create a visible notification element
  const testDiv = document.createElement('div');
  testDiv.style.position = 'fixed';
  testDiv.style.top = '10px';
  testDiv.style.right = '10px';
  testDiv.style.padding = '15px';
  testDiv.style.backgroundColor = '#ff7700';
  testDiv.style.color = 'white';
  testDiv.style.fontWeight = 'bold';
  testDiv.style.borderRadius = '5px';
  testDiv.style.zIndex = '9999';
  testDiv.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
  testDiv.textContent = 'JavaScript is running! ✅';
  
  // Add to document
  document.body.appendChild(testDiv);
  
  // Log to console as well
  console.log('JavaScript is running successfully!');
  
  // Make it disappear after 10 seconds
  setTimeout(() => {
    testDiv.style.transition = 'opacity 1s';
    testDiv.style.opacity = '0';
    setTimeout(() => testDiv.remove(), 1000);
  }, 10000);
}

// Run the test when the page loads
window.addEventListener('load', testJavaScriptIsRunning);
