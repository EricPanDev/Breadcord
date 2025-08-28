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
const breadcord_channel_list = BreadUI.create_container("breadcord-channel-container", "vstack", {})

breadcord_channel_list
  .add(BreadUI.create_element("nav-current-location", "", { text: "Direct Messages" }))
  .add(BreadUI.create_container("sidebar-channels-list", "", {}))

breadcordApp
  .add(breadcord_server_list)
  .add(breadcord_channel_list)
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
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
}

// Voice channels are always last when under a category
function sort_channels(channels) {
  const arr = Array.isArray(channels) ? channels : Array.from(channels.values?.() ?? channels);
  if (arr.length === 0) return arr;

  // Helpers that work for both discord.js and raw gateway payloads
  const getPos = ch => (ch.rawPosition ?? ch.position ?? 0);
  const getParentId = ch => (ch.parentId ?? ch.parent_id ?? null);
  const hasCmp = (a, b) =>
    typeof a?.comparePositionTo === 'function' && typeof b?.comparePositionTo === 'function';

  // Category = type 4 (or old string enum)
  const isCategory = ch =>
    ch?.type === 4 || ch?.type === 'GUILD_CATEGORY';

  // Voice-like channels: voice (2) + stage (13) or old string enums
  const isVoice = ch =>
    ch?.type === 2 || ch?.type === 'GUILD_VOICE' ||
    ch?.type === 13 || ch?.type === 'GUILD_STAGE_VOICE';

  const nameCmp = (a, b) => (a.name || '').localeCompare(b.name || '');
  const idCmp   = (a, b) => (a.id > b.id ? 1 : -1);
  const baseCmp = (a, b) => getPos(a) - getPos(b) || nameCmp(a, b) || idCmp(a, b);

  // Prefer discord.js comparator when available
  const djCmp = (a, b) => (hasCmp(a, b) ? a.comparePositionTo(b) : baseCmp(a, b));

  // Build a quick index by id
  const byId = new Map(arr.map(ch => [ch.id, ch]));

  // Top-level = categories OR channels with no parent
  const topLevel = arr
    .filter(ch => isCategory(ch) || !getParentId(ch))
    .sort(djCmp);

  // Index children by parent
  const childrenByParent = new Map();
  for (const ch of arr) {
    const pid = getParentId(ch);
    if (!pid) continue;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(ch);
  }

  // Sort each parent's children
  for (const [pid, list] of childrenByParent) {
    const parent = byId.get(pid);

    // Inside categories: voice (and stage) always last
    if (isCategory(parent)) {
      list.sort((a, b) => {
        const va = !!isVoice(a), vb = !!isVoice(b);
        if (va !== vb) return va ? 1 : -1; // non-voice before voice
        return djCmp(a, b);                 // otherwise normal order
      });
    } else {
      // Non-category parents: keep normal order
      list.sort(djCmp);
    }
  }

  // Stitch final order: top-level interleaved by position; each category followed by its children
  const out = [];
  const seen = new Set();

  for (const ch of topLevel) {
    out.push(ch); seen.add(ch.id);
    if (isCategory(ch)) {
      const kids = childrenByParent.get(ch.id);
      if (kids) for (const k of kids) { if (!seen.has(k.id)) { out.push(k); seen.add(k.id); } }
    }
  }

  // Fallback: include any stragglers (e.g., child whose parent isn’t cached)
  for (const ch of arr) if (!seen.has(ch.id)) out.push(ch);

  return out;
}

var VOICE_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z" class=""></path><path d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z" class=""></path></svg>`
var THREAD_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M18.91 12.98a5.45 5.45 0 0 1 2.18 6.2c-.1.33-.09.68.1.96l.83 1.32a1 1 0 0 1-.84 1.54h-5.5A5.6 5.6 0 0 1 10 17.5a5.6 5.6 0 0 1 5.68-5.5c1.2 0 2.32.36 3.23.98Z" class=""></path><path d="M19.24 10.86c.32.16.72-.02.74-.38L20 10c0-4.42-4.03-8-9-8s-9 3.58-9 8c0 1.5.47 2.91 1.28 4.11.14.21.12.49-.06.67l-1.51 1.51A1 1 0 0 0 2.4 18h5.1a.5.5 0 0 0 .49-.5c0-4.2 3.5-7.5 7.68-7.5 1.28 0 2.5.3 3.56.86Z" class=""></path></svg>`
var TEXT_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path  fill-rule="evenodd" d="M10.99 3.16A1 1 0 1 0 9 2.84L8.15 8H4a1 1 0 0 0 0 2h3.82l-.67 4H3a1 1 0 1 0 0 2h3.82l-.8 4.84a1 1 0 0 0 1.97.32L8.85 16h4.97l-.8 4.84a1 1 0 0 0 1.97.32l.86-5.16H20a1 1 0 1 0 0-2h-3.82l.67-4H21a1 1 0 1 0 0-2h-3.82l.8-4.84a1 1 0 1 0-1.97-.32L15.15 8h-4.97l.8-4.84ZM14.15 14l.67-4H9.85l-.67 4h4.97Z" clip-rule="evenodd" class=""></path></svg>`
var ANNOUCEMENT_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M19.56 2a3 3 0 0 0-2.46 1.28 3.85 3.85 0 0 1-1.86 1.42l-8.9 3.18a.5.5 0 0 0-.34.47v10.09a3 3 0 0 0 2.27 2.9l.62.16c1.57.4 3.15-.56 3.55-2.12a.92.92 0 0 1 1.23-.63l2.36.94c.42.27.79.62 1.07 1.03A3 3 0 0 0 19.56 22h.94c.83 0 1.5-.67 1.5-1.5v-17c0-.83-.67-1.5-1.5-1.5h-.94Zm-8.53 15.8L8 16.7v1.73a1 1 0 0 0 .76.97l.62.15c.5.13 1-.17 1.12-.67.1-.41.29-.78.53-1.1Z" clip-rule="evenodd" class=""></path><path d="M2 10c0-1.1.9-2 2-2h.5c.28 0 .5.22.5.5v7a.5.5 0 0 1-.5.5H4a2 2 0 0 1-2-2v-4Z" class=""></path></svg>`
var RULES_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M15 2a3 3 0 0 1 3 3v12H5.5a1.5 1.5 0 0 0 0 3h14a.5.5 0 0 0 .5-.5V5h1a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h10Zm-.3 5.7a1 1 0 0 0-1.4-1.4L9 10.58l-2.3-2.3a1 1 0 0 0-1.4 1.42l3 3a1 1 0 0 0 1.4 0l5-5Z" clip-rule="evenodd" class=""></path></svg>`

function getChannelIcon(channel, guild) {
  // Special-case: the guild's designated Rules channel
  if (guild?.rules_channel_id && channel.id === guild.rules_channel_id) {
    return RULES_CHANNEL_ICON;
  }

  switch (channel.type) {
    case 0: // Guild Text
      return TEXT_CHANNEL_ICON;

    case 2: // Guild Voice
    case 13: // Stage Voice
      return VOICE_CHANNEL_ICON;

    case 4: // Category (usually no leading icon; return empty)
      return "";

    case 5: // Announcement / News
      return ANNOUCEMENT_CHANNEL_ICON;

    case 10: // News Thread
    case 11: // Public Thread
    case 12: // Private Thread
      return THREAD_CHANNEL_ICON;

    case 15: // Forum (fallback to text-style icon unless you have a forum icon)
      return TEXT_CHANNEL_ICON;

    default:
      return ""; // Unknown/unsupported: no icon
  }
}

function switch_guild(guild_id) {
  console.log(`Switching to guild ${guild_id}`);
  // grab this element <div data-type="nav-current-location">Direct Messages</div>
  const nav_current_location = document.querySelector('[data-type="nav-current-location"]');
  const guild = BreadCache.getGuild(guild_id);
  if (guild) {
    nav_current_location.innerText = guild.name;
  } else {
    nav_current_location.innerText = "Unknown Guild";
  }
  const sidebar_channels_list = document.querySelector('[data-container-id="sidebar-channels-list"]');
  const sidebar_channels_list_ui = BreadUI.get_container("sidebar-channels-list");
  // remove everything from it
  while (sidebar_channels_list.firstChild) {
    sidebar_channels_list.removeChild(sidebar_channels_list.firstChild);
  }
  const channels = guild.channels;
  const sorted_channels = sort_channels(channels);

  console.log("Sorted Channels:", sorted_channels);

for (const channel of sorted_channels) {
  const iconHtml = getChannelIcon(channel, guild);
    let channel_element;
    if (channel.type === 4) {
      channel_element = BreadUI.create_element(`category-${channel.id}`, {}, { text: channel.name });
    } else {
      channel_element = BreadUI.create_container(`channel-${channel.id}`, "", {});
      const channel_element_icon = BreadUI.create_element(`channelicon-${channel.id}`, {}, { html: iconHtml });
      channel_element.add(channel_element_icon);
      const channel_element_text = BreadUI.create_element(`channeltext-${channel.id}`, {}, { text: channel.name });
      channel_element.add(channel_element_text);
    }
    sidebar_channels_list_ui.add(channel_element);
  }
}

BreadCache.on_ready(() => {
  let user_corner_profile_card_style = {};
  if (BreadCache?.user?.collectibles?.nameplate?.asset) {
    user_corner_profile_card_style = {
      backgroundImage: `url(https://cdn.discordapp.com/assets/collectibles/${BreadCache.user.collectibles.nameplate.asset}static.png)` // or asset.webm
    };
  }
  const user_corner_profile_card = BreadUI.create_container(`user-corner-profile-card`, "", user_corner_profile_card_style);
  breadcord.add(user_corner_profile_card);

  const user_corner_profile_card_text_name = BreadUI.create_element(`user-corner-profile-card-text-name`, "", {text: BreadCache.user.global_name || BreadCache.user.username});
  const user_corner_profile_card_text_status = BreadUI.create_element(`user-corner-profile-card-text-status`, "", {text: BreadCache.user_settings?.custom_status?.text || BreadCache.user.username});
  const user_corner_profile_card_settings_btn = BreadUI.create_element(`user-corner-profile-card-settings-btn`, "", { html: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" width="24" height="24" preserveAspectRatio="xMidYMid meet"><defs><clipPath id="__lottie_element_101"><rect width="24" height="24" x="0" y="0"></rect></clipPath><clipPath id="__lottie_element_103"><path d="M0,0 L600,0 L600,600 L0,600z"></path></clipPath></defs><g clip-path="url(#__lottie_element_101)"><g clip-path="url(#__lottie_element_103)" transform="matrix(0.03999999910593033,0,0,0.03999999910593033,0,0)" opacity="1" style="display: block;"><g transform="matrix(25,0,0,25,300,300)" opacity="1" style="display: block;"><g opacity="1" transform="matrix(1,0,0,1,0,0)"><path fill-opacity="1" d=" M-1.4420000314712524,-10.906000137329102 C-1.8949999809265137,-10.847000122070312 -2.1470000743865967,-10.375 -2.078000068664551,-9.92300033569336 C-1.899999976158142,-8.756999969482422 -2.265000104904175,-7.7210001945495605 -3.061000108718872,-7.390999794006348 C-3.8570001125335693,-7.060999870300293 -4.8480000495910645,-7.534999847412109 -5.546000003814697,-8.484999656677246 C-5.816999912261963,-8.852999687194824 -6.329999923706055,-9.008999824523926 -6.691999912261963,-8.730999946594238 C-7.458000183105469,-8.142999649047852 -8.142999649047852,-7.458000183105469 -8.730999946594238,-6.691999912261963 C-9.008999824523926,-6.329999923706055 -8.852999687194824,-5.816999912261963 -8.484999656677246,-5.546000003814697 C-7.534999847412109,-4.8480000495910645 -7.060999870300293,-3.8570001125335693 -7.390999794006348,-3.061000108718872 C-7.7210001945495605,-2.265000104904175 -8.756999969482422,-1.899999976158142 -9.92300033569336,-2.078000068664551 C-10.375,-2.1470000743865967 -10.847000122070312,-1.8949999809265137 -10.906000137329102,-1.4420000314712524 C-10.968000411987305,-0.9700000286102295 -11,-0.48899999260902405 -11,0 C-11,0.48899999260902405 -10.968000411987305,0.9700000286102295 -10.906000137329102,1.4420000314712524 C-10.847000122070312,1.8949999809265137 -10.375,2.1470000743865967 -9.92300033569336,2.078000068664551 C-8.756999969482422,1.899999976158142 -7.7210001945495605,2.265000104904175 -7.390999794006348,3.061000108718872 C-7.060999870300293,3.8570001125335693 -7.534999847412109,4.8470001220703125 -8.484999656677246,5.546000003814697 C-8.852999687194824,5.816999912261963 -9.008999824523926,6.328999996185303 -8.730999946594238,6.691999912261963 C-8.142999649047852,7.458000183105469 -7.458000183105469,8.142999649047852 -6.691999912261963,8.730999946594238 C-6.329999923706055,9.008999824523926 -5.816999912261963,8.852999687194824 -5.546000003814697,8.484999656677246 C-4.8480000495910645,7.534999847412109 -3.8570001125335693,7.060999870300293 -3.061000108718872,7.390999794006348 C-2.265000104904175,7.7210001945495605 -1.899999976158142,8.756999969482422 -2.078000068664551,9.92300033569336 C-2.1470000743865967,10.375 -1.8949999809265137,10.847000122070312 -1.4420000314712524,10.906000137329102 C-0.9700000286102295,10.968000411987305 -0.48899999260902405,11 0,11 C0.48899999260902405,11 0.9700000286102295,10.968000411987305 1.4420000314712524,10.906000137329102 C1.8949999809265137,10.847000122070312 2.1470000743865967,10.375 2.078000068664551,9.92300033569336 C1.899999976158142,8.756999969482422 2.2660000324249268,7.7210001945495605 3.062000036239624,7.390999794006348 C3.8580000400543213,7.060999870300293 4.8480000495910645,7.534999847412109 5.546000003814697,8.484999656677246 C5.816999912261963,8.852999687194824 6.328999996185303,9.008999824523926 6.691999912261963,8.730999946594238 C7.458000183105469,8.142999649047852 8.142999649047852,7.458000183105469 8.730999946594238,6.691999912261963 C9.008999824523926,6.328999996185303 8.852999687194824,5.816999912261963 8.484999656677246,5.546000003814697 C7.534999847412109,4.8480000495910645 7.060999870300293,3.8570001125335693 7.390999794006348,3.061000108718872 C7.7210001945495605,2.265000104904175 8.756999969482422,1.899999976158142 9.92300033569336,2.078000068664551 C10.375,2.1470000743865967 10.847000122070312,1.8949999809265137 10.906000137329102,1.4420000314712524 C10.968000411987305,0.9700000286102295 11,0.48899999260902405 11,0 C11,-0.48899999260902405 10.968000411987305,-0.9700000286102295 10.906000137329102,-1.4420000314712524 C10.847000122070312,-1.8949999809265137 10.375,-2.1470000743865967 9.92300033569336,-2.078000068664551 C8.756999969482422,-1.899999976158142 7.7210001945495605,-2.265000104904175 7.390999794006348,-3.061000108718872 C7.060999870300293,-3.8570001125335693 7.534999847412109,-4.8480000495910645 8.484999656677246,-5.546000003814697 C8.852999687194824,-5.816999912261963 9.008999824523926,-6.329999923706055 8.730999946594238,-6.691999912261963 C8.142999649047852,-7.458000183105469 7.458000183105469,-8.142999649047852 6.691999912261963,-8.730999946594238 C6.328999996185303,-9.008999824523926 5.817999839782715,-8.852999687194824 5.546999931335449,-8.484999656677246 C4.848999977111816,-7.534999847412109 3.8580000400543213,-7.060999870300293 3.062000036239624,-7.390999794006348 C2.2660000324249268,-7.7210001945495605 1.9010000228881836,-8.756999969482422 2.0789999961853027,-9.92300033569336 C2.1480000019073486,-10.375 1.8949999809265137,-10.847000122070312 1.4420000314712524,-10.906000137329102 C0.9700000286102295,-10.968000411987305 0.48899999260902405,-11 0,-11 C-0.48899999260902405,-11 -0.9700000286102295,-10.968000411987305 -1.4420000314712524,-10.906000137329102z M4,0 C4,2.2090001106262207 2.2090001106262207,4 0,4 C-2.2090001106262207,4 -4,2.2090001106262207 -4,0 C-4,-2.2090001106262207 -2.2090001106262207,-4 0,-4 C2.2090001106262207,-4 4,-2.2090001106262207 4,0z"></path></g></g></g></g></svg>`});
  const user_corner_profile_card_plugins_btn = BreadUI.create_element(`user-corner-profile-card-plugins-btn`, "", { html: `<?xml version="1.0" standalone="no"?> <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN" "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd"> <svg version="1.0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900.000000 900.000000" preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,900.000000) scale(0.100000,-0.100000)" stroke="none"> <path d="M4250 7251 c-58 -4 -137 -14 -175 -20 -185 -33 -303 -60 -380 -87 -23 -8 -46 -14 -53 -14 -25 0 -279 -105 -397 -164 -360 -178 -706 -463 -945 -776 -19 -25 -38 -49 -43 -55 -78 -101 -202 -304 -251 -410 -16 -33 -35 -73 -43 -90 -75 -154 -203 -575 -203 -671 0 -16 -5 -45 -10 -64 -15 -49 -32 -332 -21 -343 5 -5 34 -2 67 6 33 8 95 23 139 32 99 21 216 46 233 51 7 2 12 20 12 45 0 104 55 363 117 549 213 635 733 1177 1358 1412 297 112 508 150 836 149 300 0 457 -24 724 -111 341 -110 626 -284 893 -544 272 -265 467 -577 582 -931 87 -269 110 -418 110 -725 0 -308 -21 -449 -110 -727 -19 -60 -29 -86 -56 -150 -8 -17 -14 -34 -14 -38 0 -4 -27 -62 -61 -129 -269 -535 -767 -968 -1319 -1148 -294 -96 -442 -119 -750 -120 -297 0 -457 25 -725 112 -160 52 -248 90 -421 185 -130 72 -334 221 -334 245 0 9 26 40 58 69 31 29 93 88 137 130 200 191 358 337 375 345 14 6 28 1 57 -21 106 -82 211 -133 368 -180 92 -27 401 -24 506 4 84 23 163 49 194 62 58 26 174 84 200 101 17 11 37 23 45 27 28 13 205 151 263 205 61 57 67 74 40 99 -20 17 -104 106 -228 239 -74 80 -132 141 -329 350 -45 47 -112 119 -150 160 -38 41 -133 142 -210 225 -78 82 -175 185 -216 230 -164 174 -245 260 -255 271 -122 133 -280 294 -288 294 -28 0 -179 -145 -272 -260 -62 -77 -135 -183 -135 -196 0 -4 -6 -15 -13 -23 -8 -9 -27 -50 -44 -91 -83 -202 -96 -262 -96 -460 0 -140 4 -178 23 -249 29 -109 68 -200 130 -303 l50 -83 -62 -60 c-68 -65 -344 -325 -387 -364 -199 -183 -471 -443 -471 -450 0 -12 165 -196 255 -285 127 -125 378 -323 455 -359 8 -4 29 -16 45 -27 79 -50 240 -133 342 -175 49 -20 102 -42 118 -49 107 -44 390 -121 508 -136 34 -5 91 -14 127 -21 84 -16 589 -16 683 0 37 6 97 16 134 21 133 21 287 61 463 123 160 56 417 180 533 257 32 22 61 40 64 40 2 0 50 35 106 77 231 173 417 359 590 590 42 56 77 104 77 106 0 3 18 31 39 63 53 80 150 268 201 389 132 311 203 629 215 965 7 172 -5 431 -25 541 -38 207 -73 351 -115 469 -129 364 -304 669 -534 929 -155 176 -369 365 -526 468 -38 25 -81 53 -95 63 -71 48 -267 150 -377 195 -49 20 -101 42 -118 49 -74 31 -300 96 -415 119 -223 46 -555 66 -800 48z"/> <path d="M4705 5913 c-42 -22 -69 -46 -250 -217 -88 -83 -194 -182 -235 -221 -178 -167 -220 -210 -218 -221 4 -19 259 -284 272 -284 6 0 34 21 61 47 186 174 547 514 581 547 23 23 49 58 58 80 30 72 14 168 -37 224 -52 57 -169 79 -232 45z"/> <path d="M5639 4923 c-41 -21 -69 -44 -268 -232 -79 -75 -155 -147 -170 -160 -156 -144 -271 -256 -271 -265 1 -10 34 -47 202 -223 33 -35 65 -63 72 -63 12 0 42 26 191 168 85 80 177 167 354 332 74 70 142 143 154 165 65 125 -29 284 -173 292 -38 2 -66 -2 -91 -14z"/> </g> </svg>`});


  const user_corner_profile_card_text = BreadUI.create_container(`user-corner-profile-card-text`, "", {});
  user_corner_profile_card_text
    .add(user_corner_profile_card_text_name)
    .add(user_corner_profile_card_text_status)
  user_corner_profile_card
    .add(user_corner_profile_card_text)
    .add(user_corner_profile_card_settings_btn)
    .add(user_corner_profile_card_plugins_btn)

  let user_corner_profile_card_style_avatar = {};

  if (BreadCache?.user?.avatar) {
    user_corner_profile_card_style_avatar.backgroundImage = `url(https://cdn.discordapp.com/avatars/${BreadCache.user.id}/${BreadCache.user.avatar}.png)`;
  }
  else {
    user_corner_profile_card_style_avatar.backgroundImage = `url(https://cdn.discordapp.com/embed/avatars/1.png)`;
  }

  const user_corner_profile_card_avatar = BreadUI.create_container(`user-corner-profile-card-avatar`, "", user_corner_profile_card_style_avatar);
  user_corner_profile_card.add(user_corner_profile_card_avatar);

  if (BreadCache?.user?.avatar_decoration_data?.asset) {
    user_corner_profile_card_avatar.add(BreadUI.create_container(`user-corner-profile-card-avatar-decoration`, "", {
      backgroundImage: `url(https://cdn.discordapp.com/avatar-decoration-presets/${BreadCache.user.avatar_decoration_data.asset}.png?size=240&passthrough=true)`
    }));
  }

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
          guild_btn.onclick(() => { switch_guild(guild.id); });
          folder_container.add(guild_btn);
        } else {
          const name = guild.name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 4);
          const guild_btn = BreadUI.create_element(`guild-${guild.id}`, {}, { text: name });
          guild_btn.onclick(() => { switch_guild(guild.id); });
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
        guild_btn.onclick(() => { switch_guild(guild.id); });
      } else {
        const name = guild.name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 4);
        const guild_btn = BreadUI.create_element(`guild-${guild.id}`, {}, { text: name });
        guild_btn.onclick(() => { switch_guild(guild.id); });
        breadcord_server_list.add(guild_btn);
      }
    }
  }
});