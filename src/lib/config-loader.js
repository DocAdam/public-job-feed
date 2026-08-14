/**
 * Configuration loading layer (legacy adapter for backward compatibility)
 *
 * Provides access to project configuration, watchlists, and settings.
 */

const fs = require("fs/promises");
const path = require("path");

const CONFIG_PATHS = {
  WATCHLIST: "config/title-watchlist.md",
  SETTINGS: "settings.json",
};

/**
 * Load job title watchlist from markdown file.
 *
 * @returns {Promise<Array<{Category:string, Title:string, NormalizedTitle:string, TokenList:string[]}>}> Watchlist records
 */
async function loadWatchlist() {
  const configDir = path.resolve(__dirname, "../../config");
  const watchlistPath = path.join(configDir, CONFIG_PATHS.WATCHLIST);

  try {
    const content = await fs.readFile(watchlistPath, "utf8");

    // Use the parser from src/core
    const { parseJobTitlesMarkdown } = require("../core/models/job-titles");
    return parseJobTitlesMarkdown(content);
  } catch (error) {
    console.error("Error loading watchlist:", error.message);
    return [];
  }
}

/**
 * Read and parse a markdown job-title watchlist.
 *
 * File I/O lives in this configuration boundary; parsing remains in core.
 *
 * @param {string} filePath - Absolute or relative markdown file path
 * @returns {Promise<Array<{Category:string, Title:string, NormalizedTitle:string, TokenList:string[]}>>}
 */
async function readJobTitles(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const { parseJobTitlesMarkdown } = require("../core/models/job-titles");
  return parseJobTitlesMarkdown(content);
}

/**
 * Load project settings from JSON file.
 *
 * @returns {Promise<Object>} Project settings object
 */
async function loadSettings() {
  const configDir = path.resolve(__dirname, "../../config");
  const settingsPath = path.join(configDir, CONFIG_PATHS.SETTINGS);

  try {
    const content = await fs.readFile(settingsPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Error loading settings:", error.message);
    return {};
  }
}

/**
 * Get path to a configuration file.
 *
 * @param {string} key - Configuration key
 * @returns {string} Absolute path to the config file
 */
function getConfigPath(key) {
  const configDir = path.resolve(__dirname, "../../config");
  return path.join(configDir, CONFIG_PATHS[key] || key);
}

module.exports = {
  loadWatchlist,
  loadSettings,
  getConfigPath,
  readJobTitles,
};
