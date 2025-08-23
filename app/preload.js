const { contextBridge, ipcRenderer } = require('electron');

ipcRenderer.send('log', "Preload Running!");

function fetch_token() {
    const iframe = document.createElement('iframe');
            
    iframe.onload = () => {
        try {
            const token = iframe.contentWindow.localStorage.getItem('token');
            ipcRenderer.send('token-found', token);
        }
        catch (err) {}
        finally {
            iframe.remove();
        }
    };

    document.body.appendChild(iframe);
}

// Run only after DOM is fully loaded
window.addEventListener('DOMContentLoaded', () => {

    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        if (window.location.hostname === 'discord.com') {
            fetch_token();
        }
    }

    if (window.location.protocol === 'file:') {}
});

// window.addEventListener("locationchange", () => {
//   ipcRenderer.send("log", "popstate fired");
//   fetch_token();
// });

let lastUrl = window.location.href;

setInterval(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
            if (window.location.hostname === 'discord.com') {
                fetch_token();
            }
        }
    }
}, 50);