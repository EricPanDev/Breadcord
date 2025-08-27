const breadcord = BreadUI.create_container("breadcord", "vstack", {});
const breadcordNav = BreadUI.create_container("breadcord-nav", "bar", {});
const breadcordApp = BreadUI.create_container("breadcord-app", "hstack", {});

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

nav_btn_close.onclick(() => { BreadAPI.app.close() });
nav_btn_minimize.onclick(() => { BreadAPI.app.minimize() });
nav_btn_fullscreen.onclick(() => { BreadAPI.app.maximize() });

breadcordNav
  .add(nav_btn_close)
  .add(nav_btn_minimize)
  .add(nav_btn_fullscreen)
  .add(BreadUI.create_element("nav-text", {}, { text: "Breadcord" }))

const breadcord_server_list = BreadUI.create_container("breadcord-server-container", "", {})

breadcordApp
  .add(breadcord_server_list)
  .add(BreadUI.create_container("breadcord-channel-container", "vstack", {}))
  .add(BreadUI.create_container("breadcord-message-container", "vstack", {}))
  .add(BreadUI.create_container("breadcord-app-sidebar", "vstack", {}))

breadcord
  .add(breadcordNav)
  .add(breadcordApp);

breadcord.mount("#app");


// Debug Light/Dark Theme Toggle
const root = document.documentElement;
root.classList.add('dark');
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p' && !e.repeat && (e.ctrlKey || e.metaKey)) {
    root.classList.toggle('dark');
    root.classList.toggle('light');
    e.preventDefault();
  }
});

// Load Breadcord CSS
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'plugins/breadcord_ui/theme.css';
document.head.appendChild(link);

function fetch_sorted_guilds() {
  const user_guild_prefs = BreadCache.user_settings.guild_folders;
  console.log("USER SETTINGS", BreadCache.user_settings)
  var guild_order = [];
  for (const folder of user_guild_prefs) {
    if (folder.guild_ids.length === 1) {
      guild_order.push(folder.guild_ids[0]);
    } else if (folder.guild_ids.length > 1) {
      guild_order.push(folder);
    }
  }
  return guild_order;
}

function get_guild_icon_url(guild) {
  console.log(`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`)
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
}

BreadCache.on_ready(() => {
  console.log("[breadcord_ui] BreadCache Ready, beginning to load servers");
  const sorted_guilds = fetch_sorted_guilds();
  console.log(sorted_guilds)

  // helper to attach toggle behavior to a folder element
  const attachFolderToggle = (folder) => {
    if (!folder) return;

    const setA11y = () => {
      const open = folder.classList.contains('is-open');
      folder.setAttribute('role', 'button');
      folder.setAttribute('tabindex', '0');
      folder.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    const open = () => { folder.classList.add('is-open'); setA11y(); };
    const close = () => { folder.classList.remove('is-open'); setA11y(); };
    const toggle = () => { folder.classList.toggle('is-open'); setA11y(); };

    setA11y();

    // Click to open; click background to close when open
    folder.addEventListener('click', (e) => {
      if (!folder.classList.contains('is-open')) {
        e.preventDefault();
        e.stopPropagation();
        open();
      } else if (e.target === folder) {
        // only collapse if clicking the empty area of the folder, not a child icon
        close();
      }
    });

    // Keyboard toggle (Enter / Space)
    folder.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    // Click outside to close (optional but nice)
    document.addEventListener('click', (e) => {
      if (folder.classList.contains('is-open') && !folder.contains(e.target)) {
        close();
      }
    });
  };

  for (const guild_id of sorted_guilds) {
    if (typeof guild_id === 'object' && !Array.isArray(guild_id) && guild_id !== null) {
      const guild_ids = guild_id.guild_ids;
      var style = {};
      var expand_style = {};
      if (guild_id.color) {
        style.backgroundColor = `#${guild_id.color.toString(16).padStart(6, '0')}4D`;
        expand_style.color = `#${guild_id.color.toString(16).padStart(6, '0')}FF`;
      }

      // Create folder container
      const folder_container = BreadUI.create_container(`guild-folder-${guild_id.id}`, "", style);

      const expand_btn = BreadUI.create_element(`guild-folderexpand-${guild_id.id}`, expand_style, {html: `<svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M2 5a3 3 0 0 1 3-3h3.93a2 2 0 0 1 1.66.9L12 5h7a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5Z" class=""></path></svg>`});
      folder_container.add(expand_btn);

      // Add each guild inside the folder
      for (const g_id of guild_ids) {
        const guild = BreadCache.getGuild(g_id);
        if (guild.icon) {
          const guild_btn = BreadUI.create_element(`guild-${guild.id}`, { backgroundImage: `url(${get_guild_icon_url(guild)})` }, {});
          folder_container.add(guild_btn);
        } else {
          const name = guild.name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 4);
          const guild_btn = BreadUI.create_element(`guild-${guild.id}`, {}, { text: name });
          folder_container.add(guild_btn);
        }
      }

      // Insert into the server list
      breadcord_server_list.add(folder_container);

      // Attach toggle behavior to this specific folder DOM node
      const folder = document.querySelector(`[data-container-id="guild-folder-${guild_id.id}"]`);
      attachFolderToggle(folder);

    } else {
      // Single (non-folder) guilds
      const guild = BreadCache.getGuild(guild_id);
      if (guild.icon) {
        const guild_btn = BreadUI.create_element(`guild-${guild.id}`, { backgroundImage: `url(${get_guild_icon_url(guild)})` }, {});
        breadcord_server_list.add(guild_btn);
      } else {
        const name = guild.name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 4);
        const guild_btn = BreadUI.create_element(`guild-${guild.id}`, {}, { text: name });
        breadcord_server_list.add(guild_btn);
      }
    }
  }
});
