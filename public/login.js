document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        showNotification(result.message, 'success');
        setTimeout(() => {
          location.href = "/";
        }, 1000);
      } else {
        showNotification(result.message || 'Login failed', 'error');
      }
    } catch (error) {
      showNotification('An error occurred. Please try again.', 'error');
    }
  });
  
  function showNotification(message, type) {
    let notification = document.querySelector('.notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'notification';
      document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
      notification.style.display = 'none';
    }, 4000);
  }