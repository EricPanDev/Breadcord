// Sapphire Integration Plugin for Breadcord
// Provides moderation case data from Sapphire API with caching

(function() {
  'use strict';

  const STORAGE_KEY = 'sapphire_integration_config';
  const CACHE_TTL = 3 * 60 * 1000; // 3 minutes in milliseconds

  class SapphireIntegrationPlugin {
    constructor() {
      this.config = {
        baseUrl: null,
        accessToken: null
      };
      this.cache = new Map();
      this.initialized = false;
      
      this.loadConfig();
    }

    /**
     * Load configuration from localStorage
     */
    loadConfig() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.config = {
            baseUrl: parsed.baseUrl || null,
            accessToken: parsed.accessToken || null
          };
          
          if (this.config.baseUrl && this.config.accessToken) {
            this.initialized = true;
            BreadAPI.info('[SapphireIntegration] Configuration loaded successfully');
          } else {
            BreadAPI.info('[SapphireIntegration] Configuration incomplete, please run SapphireIntegration.configure()');
          }
        } else {
          BreadAPI.info('[SapphireIntegration] No configuration found, please run SapphireIntegration.configure()');
        }
      } catch (err) {
        BreadAPI.alert('[SapphireIntegration] Failed to load configuration: ' + err.message);
      }
    }

    /**
     * Save configuration to localStorage
     */
    saveConfig() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
        BreadAPI.info('[SapphireIntegration] Configuration saved');
      } catch (err) {
        BreadAPI.alert('[SapphireIntegration] Failed to save configuration: ' + err.message);
      }
    }

    /**
     * Configure the plugin with API credentials
     * @param {string} baseUrl - The base URL of the Sapphire API (e.g., http://localhost:8273)
     * @param {string} accessToken - The access token for authentication
     */
    configure(baseUrl, accessToken) {
      if (!baseUrl || !accessToken) {
        BreadAPI.alert('[SapphireIntegration] Both baseUrl and accessToken are required');
        return false;
      }

      // Remove trailing slash from baseUrl
      baseUrl = baseUrl.replace(/\/$/, '');

      this.config.baseUrl = baseUrl;
      this.config.accessToken = accessToken;
      this.saveConfig();
      this.initialized = true;
      
      // Clear cache when reconfiguring
      this.clearCache();
      
      BreadAPI.info('[SapphireIntegration] Configuration updated successfully');
      return true;
    }

    /**
     * Create configuration modal UI
     */
    createConfigModal() {
      return new Promise((resolve) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          backdrop-filter: blur(4px);
        `;

        // Create modal container
        const modal = document.createElement('div');
        modal.style.cssText = `
          background: #2f3136;
          border-radius: 8px;
          padding: 24px;
          width: 500px;
          max-width: 90%;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        `;

        // Create modal content
        modal.innerHTML = `
          <h2 style="margin: 0 0 8px 0; color: #dcddde; font-size: 20px; font-weight: 600;">
            Configure Sapphire Integration
          </h2>
          <p style="margin: 0 0 20px 0; color: #96989d; font-size: 14px;">
            Connect to your Sapphire API instance to access moderation case data.
          </p>
          
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; color: #b9bbbe; font-size: 14px; font-weight: 500;">
              API Base URL
            </label>
            <input 
              type="text" 
              id="sapphire-base-url" 
              placeholder="http://localhost:8273"
              value="${this.config.baseUrl || 'http://localhost:8273'}"
              style="
                width: 100%;
                padding: 10px 12px;
                background: #202225;
                border: 1px solid #1e1f22;
                border-radius: 4px;
                color: #dcddde;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                outline: none;
                box-sizing: border-box;
              "
            />
            <small style="display: block; margin-top: 4px; color: #72767d; font-size: 12px;">
              The base URL of your Sapphire API server (without trailing slash)
            </small>
          </div>
          
          <div style="margin-bottom: 24px;">
            <label style="display: block; margin-bottom: 6px; color: #b9bbbe; font-size: 14px; font-weight: 500;">
              Access Token
            </label>
            <input 
              type="password" 
              id="sapphire-access-token" 
              placeholder="Enter your API access token"
              value="${this.config.accessToken || ''}"
              style="
                width: 100%;
                padding: 10px 12px;
                background: #202225;
                border: 1px solid #1e1f22;
                border-radius: 4px;
                color: #dcddde;
                font-size: 14px;
                font-family: 'Courier New', monospace;
                outline: none;
                box-sizing: border-box;
              "
            />
            <small style="display: block; margin-top: 4px; color: #72767d; font-size: 12px;">
              Your authentication token from Auth.txt
            </small>
          </div>
          
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button 
              id="sapphire-cancel-btn"
              style="
                padding: 10px 20px;
                background: #4f545c;
                border: none;
                border-radius: 4px;
                color: #dcddde;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.2s;
              "
            >
              Cancel
            </button>
            <button 
              id="sapphire-save-btn"
              style="
                padding: 10px 20px;
                background: #5865f2;
                border: none;
                border-radius: 4px;
                color: white;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.2s;
              "
            >
              Save Configuration
            </button>
          </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Get elements
        const baseUrlInput = document.getElementById('sapphire-base-url');
        const tokenInput = document.getElementById('sapphire-access-token');
        const saveBtn = document.getElementById('sapphire-save-btn');
        const cancelBtn = document.getElementById('sapphire-cancel-btn');

        // Focus first input
        setTimeout(() => baseUrlInput.focus(), 100);

        // Add hover effects
        saveBtn.addEventListener('mouseenter', () => {
          saveBtn.style.background = '#4752c4';
        });
        saveBtn.addEventListener('mouseleave', () => {
          saveBtn.style.background = '#5865f2';
        });
        cancelBtn.addEventListener('mouseenter', () => {
          cancelBtn.style.background = '#5d6269';
        });
        cancelBtn.addEventListener('mouseleave', () => {
          cancelBtn.style.background = '#4f545c';
        });

        // Add focus effects
        [baseUrlInput, tokenInput].forEach(input => {
          input.addEventListener('focus', () => {
            input.style.borderColor = '#5865f2';
          });
          input.addEventListener('blur', () => {
            input.style.borderColor = '#1e1f22';
          });
        });

        // Handle save
        const handleSave = () => {
          const baseUrl = baseUrlInput.value.trim();
          const token = tokenInput.value.trim();

          if (!baseUrl || !token) {
            // Show error
            const error = modal.querySelector('.error-message') || document.createElement('div');
            error.className = 'error-message';
            error.style.cssText = `
              margin-top: 12px;
              padding: 10px 12px;
              background: #f04747;
              color: white;
              border-radius: 4px;
              font-size: 13px;
              text-align: center;
            `;
            error.textContent = 'Both URL and Access Token are required';
            
            if (!modal.querySelector('.error-message')) {
              modal.insertBefore(error, modal.querySelector('div:last-child'));
            }
            return;
          }

          document.body.removeChild(overlay);
          resolve({ baseUrl, token });
        };

        // Handle cancel
        const handleCancel = () => {
          document.body.removeChild(overlay);
          resolve(null);
        };

        // Event listeners
        saveBtn.addEventListener('click', handleSave);
        cancelBtn.addEventListener('click', handleCancel);
        
        // Enter key in inputs
        baseUrlInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') tokenInput.focus();
        });
        tokenInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') handleSave();
        });

        // Escape key to close
        const handleEscape = (e) => {
          if (e.key === 'Escape') {
            handleCancel();
            document.removeEventListener('keydown', handleEscape);
          }
        };
        document.addEventListener('keydown', handleEscape);

        // Click outside to close
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            handleCancel();
          }
        });
      });
    }

    /**
     * Prompt user for configuration with custom UI
     */
    async promptConfigure() {
      const result = await this.createConfigModal();
      
      if (!result) {
        BreadAPI.info('[SapphireIntegration] Configuration cancelled');
        return false;
      }

      return this.configure(result.baseUrl, result.token);
    }

    /**
     * Get current configuration (without exposing the token)
     */
    getConfig() {
      return {
        baseUrl: this.config.baseUrl,
        hasToken: !!this.config.accessToken,
        initialized: this.initialized
      };
    }

    /**
     * Clear all cached data
     */
    clearCache() {
      this.cache.clear();
      BreadAPI.info('[SapphireIntegration] Cache cleared');
    }

    /**
     * Get cached data if valid
     * @param {string} key - Cache key
     * @returns {any|null} Cached data or null if expired/missing
     */
    getCached(key) {
      const cached = this.cache.get(key);
      if (!cached) return null;

      const now = Date.now();
      if (now - cached.timestamp > CACHE_TTL) {
        this.cache.delete(key);
        return null;
      }

      return cached.data;
    }

    /**
     * Set cached data
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     */
    setCached(key, data) {
      this.cache.set(key, {
        data: data,
        timestamp: Date.now()
      });
    }

    /**
     * Make authenticated API request
     * @param {string} endpoint - API endpoint (e.g., /cases/user/123)
     * @param {object} options - Fetch options
     * @returns {Promise<any>}
     */
    async apiRequest(endpoint, options = {}) {
      if (!this.initialized) {
        throw new Error('SapphireIntegration not configured. Run SapphireIntegration.configure() or SapphireIntegration.promptConfigure()');
      }

      const url = `${this.config.baseUrl}${endpoint}`;
      const headers = {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      };

      try {
        const response = await fetch(url, {
          ...options,
          headers
        });

        if (response.status === 401) {
          throw new Error('Unauthorized - Invalid access token');
        }

        if (response.status === 403) {
          throw new Error('Forbidden - Access token rejected');
        }

        if (response.status === 404) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || 'Not found');
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || `API request failed with status ${response.status}`);
        }

        return await response.json();
      } catch (err) {
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          throw new Error(`Failed to connect to API at ${this.config.baseUrl}. Is the server running?`);
        }
        throw err;
      }
    }

    /**
     * Fetch moderation cases for a single user
     * @param {string} userId - Discord user ID
     * @param {string} [type] - Optional filter by case type (ban, kick, mute, warn)
     * @returns {Promise<object>} User cases data
     */
    async fetch(userId, type = null) {
      if (!userId) {
        throw new Error('userId is required');
      }

      const cacheKey = `user:${userId}:${type || 'all'}`;
      
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        return cached;
      }

      // Build endpoint
      let endpoint = `/cases/user/${encodeURIComponent(userId)}`;
      if (type) {
        endpoint += `?type=${encodeURIComponent(type)}`;
      }

      const data = await this.apiRequest(endpoint);
      
      // Cache the result
      this.setCached(cacheKey, data);
      
      return data;
    }

    /**
     * Fetch moderation cases for multiple users (batch request)
     * @param {string[]} userIds - Array of Discord user IDs
     * @param {string} [type] - Optional filter by case type (ban, kick, mute, warn)
     * @returns {Promise<object>} Object with userId as keys and case data as values
     */
    async mass_fetch(userIds, type = null) {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new Error('userIds must be a non-empty array');
      }

      const cacheKey = `batch:${userIds.sort().join(',')}:${type || 'all'}`;
      
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        return cached;
      }

      // Build endpoint
      let endpoint = '/cases/users';
      if (type) {
        endpoint += `?type=${encodeURIComponent(type)}`;
      }

      const data = await this.apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(userIds)
      });
      
      // Cache the result
      this.setCached(cacheKey, data);
      
      return data;
    }

    /**
     * Fetch a specific case by ID
     * @param {string} caseId - Case ID
     * @returns {Promise<object>} Case data
     */
    async fetchCase(caseId) {
      if (!caseId) {
        throw new Error('caseId is required');
      }

      const cacheKey = `case:${caseId}`;
      
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        return cached;
      }

      const endpoint = `/cases/${encodeURIComponent(caseId)}`;
      const data = await this.apiRequest(endpoint);
      
      // Cache the result
      this.setCached(cacheKey, data);
      
      return data;
    }

    /**
     * Fetch all cases with pagination
     * @param {number} [skip=0] - Number of cases to skip
     * @param {number} [limit=100] - Number of cases to return
     * @param {string} [type] - Optional filter by case type
     * @returns {Promise<object>} Cases data with pagination info
     */
    async fetchAll(skip = 0, limit = 100, type = null) {
      const cacheKey = `all:${skip}:${limit}:${type || 'all'}`;
      
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        return cached;
      }

      // Build endpoint
      let endpoint = `/cases?skip=${skip}&limit=${limit}`;
      if (type) {
        endpoint += `&type=${encodeURIComponent(type)}`;
      }

      const data = await this.apiRequest(endpoint);
      
      // Cache the result
      this.setCached(cacheKey, data);
      
      return data;
    }

    /**
     * Fetch statistics
     * @returns {Promise<object>} Statistics data
     */
    async fetchStats() {
      const cacheKey = 'stats';
      
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        return cached;
      }

      const data = await this.apiRequest('/stats');
      
      // Cache the result
      this.setCached(cacheKey, data);
      
      return data;
    }

    /**
     * Reload data on the API server
     * @returns {Promise<object>} Reload result
     */
    async reload() {
      const data = await this.apiRequest('/reload', { method: 'POST' });
      
      // Clear local cache after reload
      this.clearCache();
      
      return data;
    }

    /**
     * Get cache statistics
     * @returns {object} Cache stats
     */
    getCacheStats() {
      const now = Date.now();
      let validEntries = 0;
      let expiredEntries = 0;

      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          expiredEntries++;
        } else {
          validEntries++;
        }
      }

      return {
        totalEntries: this.cache.size,
        validEntries,
        expiredEntries,
        ttlMinutes: CACHE_TTL / 60000
      };
    }
  }

  // Create global instance
  const SapphireIntegration = new SapphireIntegrationPlugin();

  // Expose to window
  window.SapphireIntegration = SapphireIntegration;

  // Check if configuration exists on load
  if (!SapphireIntegration.initialized) {
    BreadAPI.info('[SapphireIntegration] Plugin loaded but not configured.');
    
    // Automatically show configuration prompt after a short delay
    setTimeout(async () => {
      BreadAPI.info('[SapphireIntegration] Opening configuration prompt...');
      const configured = await SapphireIntegration.promptConfigure();
      
      if (configured) {
        BreadAPI.info('[SapphireIntegration] Plugin configured and ready!');
        BreadAPI.info('[SapphireIntegration] Available methods:');
        BreadAPI.info('  - SapphireIntegration.fetch(userId, type?)');
        BreadAPI.info('  - SapphireIntegration.mass_fetch([userIds], type?)');
        BreadAPI.info('  - SapphireIntegration.fetchCase(caseId)');
        BreadAPI.info('  - SapphireIntegration.fetchAll(skip?, limit?, type?)');
        BreadAPI.info('  - SapphireIntegration.fetchStats()');
        BreadAPI.info('  - SapphireIntegration.clearCache()');
        BreadAPI.info('  - SapphireIntegration.getCacheStats()');
      } else {
        BreadAPI.info('[SapphireIntegration] Configuration skipped. Run SapphireIntegration.promptConfigure() to configure later.');
      }
    }, 2000); // Wait 2 seconds after plugin loads
  } else {
    BreadAPI.info('[SapphireIntegration] Plugin loaded and ready!');
    BreadAPI.info('[SapphireIntegration] Available methods:');
    BreadAPI.info('  - SapphireIntegration.fetch(userId, type?)');
    BreadAPI.info('  - SapphireIntegration.mass_fetch([userIds], type?)');
    BreadAPI.info('  - SapphireIntegration.fetchCase(caseId)');
    BreadAPI.info('  - SapphireIntegration.fetchAll(skip?, limit?, type?)');
    BreadAPI.info('  - SapphireIntegration.fetchStats()');
    BreadAPI.info('  - SapphireIntegration.clearCache()');
    BreadAPI.info('  - SapphireIntegration.getCacheStats()');
  }

  // Listen for BreadAPI events (example)
  BreadAPI.on('ready', () => {
    BreadAPI.info('[SapphireIntegration] BreadAPI ready');
  });

  // ============================================
  // MESSAGE BADGE SYSTEM
  // ============================================

  // Store badge data to avoid excessive API calls
  const userBadgeCache = new Map();
  const BADGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get badge data for a user (with caching)
   */
  async function getUserBadgeData(userId) {
    // Check cache first
    const cached = userBadgeCache.get(userId);
    if (cached && Date.now() - cached.timestamp < BADGE_CACHE_TTL) {
      return cached.data;
    }

    // Fetch from API if configured
    if (!SapphireIntegration.initialized) {
      return null;
    }

    try {
      // Fetch different case types (including mutes)
      const [warns, kicks, bans, mutes] = await Promise.all([
        SapphireIntegration.fetch(userId, 'warn').catch(() => ({ total_cases: 0 })),
        SapphireIntegration.fetch(userId, 'kick').catch(() => ({ total_cases: 0 })),
        SapphireIntegration.fetch(userId, 'ban').catch(() => ({ total_cases: 0 })),
        SapphireIntegration.fetch(userId, 'mute').catch(() => ({ total_cases: 0 }))
      ]);

      const data = {
        warns: warns.total_cases || 0,
        kicks: kicks.total_cases || 0,
        bans: bans.total_cases || 0,
        mutes: mutes.total_cases || 0
      };

      // Cache the result
      userBadgeCache.set(userId, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (err) {
      console.error('[SapphireIntegration] Failed to fetch badge data:', err);
      return null;
    }
  }

  /**
   * Create a single moderation badge element
   */
  function createSingleBadge(type, count, userId) {
    const badge = document.createElement('span');
    badge.className = `sapphire-mod-badge sapphire-mod-badge--${type}`;
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin-right: 4px;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      vertical-align: middle;
      cursor: pointer;
      transition: opacity 0.2s;
    `;

    const configs = {
      ban: {
        background: 'rgba(240, 71, 71, 0.2)',
        color: '#f04747',
        border: '1px solid rgba(240, 71, 71, 0.3)',
        label: 'BAN'
      },
      kick: {
        background: 'rgba(250, 166, 26, 0.2)',
        color: '#faa61a',
        border: '1px solid rgba(250, 166, 26, 0.3)',
        label: 'KICK'
      },
      mute: {
        background: 'rgba(88, 101, 242, 0.2)',
        color: '#5865f2',
        border: '1px solid rgba(88, 101, 242, 0.3)',
        label: 'MUTE'
      },
      warn: {
        background: 'rgba(255, 212, 42, 0.2)',
        color: '#ffd42a',
        border: '1px solid rgba(255, 212, 42, 0.3)',
        label: 'WARN'
      }
    };

    const config = configs[type];
    if (config) {
      badge.style.background = config.background;
      badge.style.color = config.color;
      badge.style.border = config.border;
      badge.textContent = `${config.label} ×${count}`;
      badge.title = `Click to view ${count} ${type}${count > 1 ? 's' : ''}`;
      
      // Add click handler to show modal
      badge.onclick = (e) => {
        e.stopPropagation();
        showCaseDetailsModal(userId, type);
      };
      
      // Hover effect
      badge.onmouseover = () => badge.style.opacity = '0.8';
      badge.onmouseout = () => badge.style.opacity = '1';
    }

    return badge;
  }

  /**
   * Create a container with all moderation badges
   */
  function createModerationBadges(warns, kicks, bans, mutes, userId) {
    const container = document.createElement('span');
    container.className = 'sapphire-mod-badges';
    container.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 0;
      margin-right: 6px;
    `;

    // Build tooltip
    const tooltipParts = [];
    if (bans > 0) tooltipParts.push(`${bans} ban${bans > 1 ? 's' : ''}`);
    if (kicks > 0) tooltipParts.push(`${kicks} kick${kicks > 1 ? 's' : ''}`);
    if (mutes > 0) tooltipParts.push(`${mutes} mute${mutes > 1 ? 's' : ''}`);
    if (warns > 0) tooltipParts.push(`${warns} warning${warns > 1 ? 's' : ''}`);
    
    container.title = `Moderation History: ${tooltipParts.join(', ')} (click to view details)`;

    // Add badges in order of severity
    if (bans > 0) container.appendChild(createSingleBadge('ban', bans, userId));
    if (kicks > 0) container.appendChild(createSingleBadge('kick', kicks, userId));
    if (mutes > 0) container.appendChild(createSingleBadge('mute', mutes, userId));
    if (warns > 0) container.appendChild(createSingleBadge('warn', warns, userId));

    return container;
  }

  /**
   * Format timestamp to readable date/time
   */
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    // Format full date
    const formatted = date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Add relative time
    let relative = '';
    if (days > 0) {
      relative = `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      relative = `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      relative = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      relative = 'Just now';
    }

    return { formatted, relative };
  }

  /**
   * Create and show case details modal
   */
  async function showCaseDetailsModal(userId, caseType) {
    if (!SapphireIntegration.initialized) return;

    try {
      // Fetch all cases of this type for the user
      const data = await SapphireIntegration.fetch(userId, caseType);
      
      if (!data || !data.cases || data.cases.length === 0) {
        console.log(`No ${caseType} cases found for user ${userId}`);
        return;
      }

      const cases = data.cases;

      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.className = 'sapphire-modal-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
      `;

      // Create modal container
      const modal = document.createElement('div');
      modal.className = 'sapphire-modal';
      modal.style.cssText = `
        background: #2f3136;
        border-radius: 8px;
        width: 90%;
        max-width: 800px;
        max-height: 80vh;
        overflow: hidden;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
        display: flex;
        flex-direction: column;
      `;

      // Modal header
      const header = document.createElement('div');
      header.style.cssText = `
        padding: 20px;
        border-bottom: 1px solid #202225;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

      const title = document.createElement('h2');
      title.style.cssText = `
        margin: 0;
        color: #ffffff;
        font-size: 20px;
        font-weight: 600;
      `;
      title.textContent = `${caseType.toUpperCase()} Cases (${cases.length})`;

      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '✕';
      closeBtn.style.cssText = `
        background: transparent;
        border: none;
        color: #b9bbbe;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      `;
      closeBtn.onmouseover = () => closeBtn.style.background = '#rgba(255, 255, 255, 0.1)';
      closeBtn.onmouseout = () => closeBtn.style.background = 'transparent';
      closeBtn.onclick = () => overlay.remove();

      header.appendChild(title);
      header.appendChild(closeBtn);

      // Modal body (scrollable)
      const body = document.createElement('div');
      body.style.cssText = `
        padding: 20px;
        overflow-y: auto;
        flex: 1;
      `;

      // Add each case
      for (let index = 0; index < cases.length; index++) {
        const caseData = cases[index];
        
        const caseCard = document.createElement('div');
        caseCard.style.cssText = `
          background: #36393f;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: ${index < cases.length - 1 ? '12px' : '0'};
          border-left: 3px solid ${getCaseColor(caseType)};
        `;

        const { formatted, relative } = formatTimestamp(caseData.timestamp);

        // Case ID and timestamp
        const caseHeader = document.createElement('div');
        caseHeader.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        `;

        const caseId = document.createElement('span');
        caseId.style.cssText = `
          color: #b9bbbe;
          font-size: 12px;
          font-family: 'Courier New', monospace;
        `;
        caseId.textContent = `Case #${caseData.id}`;

        const timestamp = document.createElement('span');
        timestamp.style.cssText = `
          color: #72767d;
          font-size: 12px;
        `;
        timestamp.textContent = relative;
        timestamp.title = formatted;

        caseHeader.appendChild(caseId);
        caseHeader.appendChild(timestamp);

        // Reason
        const reasonLabel = document.createElement('div');
        reasonLabel.style.cssText = `
          color: #b9bbbe;
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 600;
          margin-bottom: 4px;
        `;
        reasonLabel.textContent = 'Reason';

        const reasonText = document.createElement('div');
        reasonText.style.cssText = `
          color: #dcddde;
          font-size: 14px;
          margin-bottom: 12px;
          line-height: 1.4;
        `;
        reasonText.textContent = caseData.reason || 'No reason provided';

        // Moderator info
        const authorId = caseData.authorId || caseData.author_id || caseData.moderatorId || caseData.moderator_id || caseData.creator || caseData.creatorId || caseData.creator_id;
        
        // Fetch user data from BreadCache
        let userData = null;
        if (authorId && typeof BreadCache !== 'undefined') {
          userData = BreadCache.getUser(authorId);
          if (!userData) {
            // Try to fetch from API if not in cache
            try {
              userData = await BreadCache.fetchUser(authorId);
            } catch (err) {
              console.warn('[Sapphire] Failed to fetch user data for', authorId);
            }
          }
        }

        const modInfo = document.createElement('div');
        modInfo.style.cssText = `
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        `;

        const modLabel = document.createElement('span');
        modLabel.style.cssText = `
          color: #b9bbbe;
          font-size: 12px;
        `;
        modLabel.textContent = 'Moderator:';

        modInfo.appendChild(modLabel);

        if (userData) {
          // Show avatar
          const avatar = document.createElement('img');
          const avatarHash = userData.avatar;
          const avatarUrl = avatarHash 
            ? `https://cdn.discordapp.com/avatars/${authorId}/${avatarHash}.${avatarHash.startsWith('a_') ? 'gif' : 'png'}?size=32`
            : `https://cdn.discordapp.com/embed/avatars/${(parseInt(authorId) >> 22) % 6}.png`;
          
          avatar.src = avatarUrl;
          avatar.style.cssText = `
            width: 24px;
            height: 24px;
            border-radius: 50%;
            flex-shrink: 0;
          `;
          avatar.onerror = () => {
            avatar.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
          };

          // Show username
          const username = document.createElement('span');
          username.style.cssText = `
            color: #dcddde;
            font-size: 14px;
            font-weight: 500;
          `;
          username.textContent = userData.global_name || userData.username || 'Unknown User';

          modInfo.appendChild(avatar);
          modInfo.appendChild(username);
        } else {
          // Fallback to ID if user data not available
          const modId = document.createElement('span');
          modId.style.cssText = `
            color: #dcddde;
            font-size: 12px;
            font-family: 'Courier New', monospace;
          `;
          modId.textContent = authorId || 'Unknown';
          modInfo.appendChild(modId);
        }

        // Proof link (if exists)
        if (caseData.proof) {
          const proofLink = document.createElement('a');
          proofLink.href = caseData.proof;
          proofLink.target = '_blank';
          proofLink.style.cssText = `
            color: #00aff4;
            font-size: 12px;
            text-decoration: none;
            display: inline-block;
            margin-top: 8px;
          `;
          proofLink.textContent = '🔗 View Proof';
          proofLink.onmouseover = () => proofLink.style.textDecoration = 'underline';
          proofLink.onmouseout = () => proofLink.style.textDecoration = 'none';
          caseCard.appendChild(proofLink);
        }

        caseCard.appendChild(caseHeader);
        caseCard.appendChild(reasonLabel);
        caseCard.appendChild(reasonText);
        caseCard.appendChild(modInfo);

        body.appendChild(caseCard);
      }

      modal.appendChild(header);
      modal.appendChild(body);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Close on overlay click
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          overlay.remove();
        }
      };

      // Close on escape key
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);

    } catch (err) {
      console.error('Failed to load case details:', err);
    }
  }

  /**
   * Get color for case type
   */
  function getCaseColor(type) {
    const colors = {
      ban: '#f04747',
      kick: '#faa61a',
      mute: '#5865f2',
      warn: '#ffd42a'
    };
    return colors[type] || '#b9bbbe';
  }

  /**
   * Add badge to a message element
   */
  async function addBadgeToMessage(messageElement, userId) {
    if (!userId || !SapphireIntegration.initialized) return;

    // Check if badge already exists
    if (messageElement.querySelector('.sapphire-mod-badges')) return;

    try {
      const badgeData = await getUserBadgeData(userId);
      
      if (!badgeData) return;
      
      const { warns, kicks, bans, mutes } = badgeData;
      const total = warns + kicks + bans + mutes;
      
      if (total === 0) return; // No cases, no badge

      const badges = createModerationBadges(warns, kicks, bans, mutes, userId);

      // Find the message header and timestamp
      const header = messageElement.querySelector('.breadcord-message__header');
      const timestamp = messageElement.querySelector('.breadcord-message__timestamp');

      if (header && timestamp) {
        // Insert badges before timestamp
        header.insertBefore(badges, timestamp);
      } else if (header) {
        // Fallback: append to header
        header.appendChild(badges);
      }
    } catch (err) {
      // Silently fail - don't spam console for each message
    }
  }

  /**
   * Process all visible messages and add badges
   */
  function processVisibleMessages() {
    if (!SapphireIntegration.initialized) return;

    // Find all message elements (breadcord_messagerenderer uses .breadcord-message)
    const messages = document.querySelectorAll('.breadcord-message[data-author-id]');

    messages.forEach(messageEl => {
      const userId = messageEl.dataset.authorId;
      if (userId) {
        addBadgeToMessage(messageEl, userId);
      }
    });
  }

  // Set up mutation observer to detect new messages
  function setupMessageObserver() {
    if (!SapphireIntegration.initialized) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the node itself is a message
            if (node.classList?.contains('breadcord-message') && node.dataset?.authorId) {
              addBadgeToMessage(node, node.dataset.authorId);
            }
            
            // Check for messages within the added node
            const messages = node.querySelectorAll?.('.breadcord-message[data-author-id]');
            messages?.forEach(msg => {
              if (msg.dataset.authorId) {
                addBadgeToMessage(msg, msg.dataset.authorId);
              }
            });
          }
        });
      });
    });

    // Observe the document body for new messages
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    BreadAPI.info('[SapphireIntegration] Message observer set up');
  }

  // Initialize badge system when plugin is configured
  if (SapphireIntegration.initialized) {
    setTimeout(() => {
      setupMessageObserver();
      processVisibleMessages();
    }, 1000);
  }

  // Expose utility functions
  SapphireIntegration.refreshBadges = processVisibleMessages;
  SapphireIntegration.clearBadgeCache = () => {
    userBadgeCache.clear();
    BreadAPI.info('[SapphireIntegration] Badge cache cleared');
  };

  // Listen for configuration changes
  const originalConfigure = SapphireIntegration.configure.bind(SapphireIntegration);
  SapphireIntegration.configure = function(...args) {
    const result = originalConfigure(...args);
    if (result) {
      // Set up observer after configuration
      setTimeout(() => {
        setupMessageObserver();
        processVisibleMessages();
      }, 1000);
    }
    return result;
  };

})();
