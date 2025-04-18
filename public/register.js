document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  
  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // Success
      showNotification(result.message, 'success');
      setTimeout(() => {
        location.href = "/"; // Redirect to dashboard
      }, 1000);
    } else {
      // Error
      showNotification(result.message || 'Registration failed', 'error');
    }
  } catch (error) {
    showNotification('An error occurred. Please try again.', 'error');
  }
});

function showNotification(message, type) {
  // Check if notification div exists, if not create it
  let notification = document.querySelector('.notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.className = 'notification';
    document.body.appendChild(notification);
  }
  
  // Set message and type
  notification.textContent = message;
  notification.className = `notification ${type}`;
  
  // Show notification
  notification.style.display = 'block';
  
  // Hide after 4 seconds
  setTimeout(() => {
    notification.style.display = 'none';
  }, 4000);
}