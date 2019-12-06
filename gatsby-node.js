"use strict";

var _gatsbySourceFilesystem = require("gatsby-source-filesystem");

var _fetch = _interopRequireDefault(require("./fetch"));

var _process = require("./process");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.sourceNodes = async ({
  actions,
  store,
  cache,
  createNodeId
}, {
  url,
  project,
  email,
  password,
  allItems,
  downloadLocalFiles,
  showWarningMessages,
  showInfoMessages
}) => {
  const {
    createNode
  } = actions;
  (0, _process.info)('Directus Data Fetcher initializing...');
  let fetcher;

  try {
    fetcher = new _fetch.default(url, project, email, password, allItems);
    (0, _process.success)('Connected to Directus!');
  } catch (e) {
    (0, _process.info)('Failed to initialize Directus connection. Please check your gatsby-config.js');
    throw e;
  }

  try {
    await fetcher.init();
    (0, _process.success)('Logged in to Directus!');
  } catch (e) {
    (0, _process.info)('Failed to log in. Attempting to use Directus public API...');
  }

  (0, _process.info)('Fetching Directus file data...');
  const allFilesData = await fetcher.getAllFiles();
  (0, _process.success)(`Found ${allFilesData.length.toString().yellow} files from Directus.`);
  (0, _process.info)('Downloading Directus files to Gatsby build cache...');
  const nodeFilesData = (0, _process.prepareFileNodes)(allFilesData);
  const nodeFiles = await (0, _process.createNodesFromFiles)(nodeFilesData, createNode, async f => (0, _gatsbySourceFilesystem.createRemoteFileNode)({
    url: f.data.full_url,
    store,
    cache,
    createNode,
    createNodeId
  }), downloadLocalFiles);

  if (nodeFiles.length === allFilesData.length) {
    (0, _process.success)(`Downloaded all ${nodeFiles.length.toString().yellow} files from Directus!`);
  } else {
    (0, _process.warn)(`skipped ${(allFilesData.length - nodeFiles.length).toString().yellow} files from downloading`);
  }

  (0, _process.info)('Fetching Directus Collection data...');
  const allCollectionsData = await fetcher.getAllCollections();
  (0, _process.info)('Fetching Directus Items data...');
  const entities = await fetcher.getAllEntities(allCollectionsData);
  (0, _process.info)('Fetching Directus Relations data...');
  const relations = await fetcher.getAllRelations();
  (0, _process.info)('Mapping Directus relations to Items...');
  const nodeEntities = (0, _process.prepareNodes)(entities);
  const relationMappedEntities = (0, _process.mapRelations)(nodeEntities, relations, nodeFiles, showWarningMessages, showInfoMessages);
  (0, _process.info)('Mapping Directus files to Items...');
  const mappedEntities = (0, _process.mapFilesToNodes)(nodeFiles, allCollectionsData, relationMappedEntities, showInfoMessages);
  (0, _process.info)('Generating GraphQL nodes...');
  await (0, _process.createNodesFromEntities)(mappedEntities, createNode);
  (0, _process.success)('All done!');
};