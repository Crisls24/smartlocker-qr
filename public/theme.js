function applyTheme() {
    const theme = localStorage.getItem('smartlock_theme') || 'light';
    const isDark = theme === 'dark';
    
    if (isDark) {
        document.documentElement.classList.add('dark-theme');
    } else {
        document.documentElement.classList.remove('dark-theme');
    }

    // Update all theme toggle buttons
    const buttons = document.querySelectorAll('.theme-toggle, .theme-toggle-admin');
    buttons.forEach(btn => {
        const icon = isDark ? '☀️' : '🌙';
        btn.innerHTML = `<span>${icon}</span> Cambio de tema`;
    });
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('smartlock_theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('smartlock_theme', newTheme);
    applyTheme();
}

// Apply immediately if script is loaded
document.addEventListener('DOMContentLoaded', applyTheme);
applyTheme();
