async function saveSetup() {
    console.log("The button is working!");
    const income = document.getElementById('income').value;
    const savings = document.getElementById('savings').value;
    const token = localStorage.getItem('fintwin_token');
    console.log("DEBUG: Token retrieved in setup.html:", token);

    // Add this check to see why it fails
    if (!token || token === 'undefined') {
        console.error("Token is missing!");
        alert("Session expired. Please log in again.");
        return;
    }

    const response = await fetch('http://127.0.0.1:5000/api/profile/setup', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // <--- This MUST be here
        },
        body: JSON.stringify({ income, savings })
    });

    if (response.status === 403) {
        alert("Session expired. Please log in again.");
    } else {
        alert("Configuration saved!");
    }
}