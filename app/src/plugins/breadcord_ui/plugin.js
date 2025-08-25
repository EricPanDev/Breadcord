const breadcord = BreadUI.create_container("breadcord", "vstack", {});
const breadcordNav = BreadUI.create_container("breadcord-nav", "bar", {});
const breadcordApp = BreadUI.create_container("breadcord-app", "vstack", {});

const nav_btn_close = BreadUI.create_element("nav-btn-close", {}, {
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
           <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.42L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4z"/>
         </svg>`
})
const nav_btn_minimize = BreadUI.create_element("nav-btn-minimize", {}, {
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
           <rect x="5" y="11" width="14" height="2" rx="1" />
         </svg>`
})
const nav_btn_fullscreen = BreadUI.create_element("nav-btn-fullscreen", {}, {
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
           <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="9 3 3 3 3 9"/>
             <polyline points="15 3 21 3 21 9"/>
             <polyline points="9 21 3 21 3 15"/>
             <polyline points="15 21 21 21 21 15"/>
           </g>
         </svg>`
})

nav_btn_close.onclick(() => {
    BreadAPI.app.close()
  });

nav_btn_minimize.onclick(() => {
    BreadAPI.app.minimize()
  });

nav_btn_fullscreen.onclick(() => {
    BreadAPI.app.maximize()
  });

breadcordNav
  .add(nav_btn_close)
  .add(nav_btn_minimize)
  .add(nav_btn_fullscreen)
  .add(BreadUI.create_element("nav-text", {}, { text: "Breadcord" }))

breadcord
  .add(breadcordNav)
  .add(breadcordApp);

breadcord.mount("#app");


const root = document.documentElement;
root.classList.add('dark');

const themeToggleBtn = document.createElement('button');
themeToggleBtn.textContent = 'debug toggle theme button';
themeToggleBtn.style.margin = '16px';
themeToggleBtn.onclick = () => {
  root.classList.toggle('dark');
  root.classList.toggle('light');
};
document.querySelector('div[data-container-id="breadcord-app"]').appendChild(themeToggleBtn);

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'plugins/breadcord_ui/theme.css';
document.head.appendChild(link);