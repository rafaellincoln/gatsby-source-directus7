"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createNodesFromEntities = exports.mapFilesToNodes = exports.mapRelations = exports.createNodesFromFiles = exports.prepareFileNodes = exports.prepareNodes = exports.success = exports.error = exports.warn = exports.info = void 0;

var _gatsbyNodeHelpers = _interopRequireDefault(require("gatsby-node-helpers"));

var _pluralize = _interopRequireDefault(require("pluralize"));

var _colors = _interopRequireDefault(require("colors"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// eslint-disable-line
const info = msg => console.log('gatsby-source-directus'.blue, 'info'.cyan, msg);

exports.info = info;

const warn = msg => console.log('gatsby-source-directus'.blue, 'warning'.yellow, msg);

exports.warn = warn;

const error = (msg, e) => console.error('gatsby-source-directus'.blue, 'error'.red, msg, e);

exports.error = error;

const success = msg => console.log('gatsby-source-directus'.blue, 'success'.green, msg);

exports.success = success;
const {
  createNodeFactory,
  generateNodeId
} = (0, _gatsbyNodeHelpers.default)({
  typePrefix: 'Directus'
});
/**
 * Transforms the table name into a Gatsby Node Type name
 * All this does, is making the first letter uppercase and singularizing it if possible.
 * Also, it checks if there's an exception to this name to use instead
 */

const getNodeTypeNameForCollection = name => {
  let nodeName = name; // If the name is plural, use the Pluralize plugin to try make it singular
  // This is to conform to the Gatsby convention of using singular names in their node types

  if (_pluralize.default.isPlural(nodeName)) {
    nodeName = _pluralize.default.singular(nodeName);
  } // Make the first letter upperace as per Gatsby's convention


  nodeName = nodeName.charAt(0).toUpperCase() + nodeName.slice(1);
  return nodeName;
};
/**
 * If the item from Directus doesn't have an id field, this generates
 * one and assumes the first field's value is good enough to be an
 * unique identifier.
 *
 * Directus's tutorials for creating translations doesn't add an
 * ID field to the translation tables, resulting in default node
 * generation giving every language item with id 'undefined'. This should
 * circumvent that issue.
 */


const ensureNodeHasId = nodeType => node => {
  if (node.id.endsWith('undefined')) {
    const candidateId = node[Object.keys(node).shift()];
    node.id = generateNodeId(nodeType, candidateId);
  }

  return node;
};
/**
 * Calls a node creation helper on each item
 */


const prepareNodes = entities => {
  const newEntities = entities;
  Object.keys(entities).forEach(entity => {
    const name = getNodeTypeNameForCollection(entity);
    const generateItemNode = createNodeFactory(name, ensureNodeHasId(name));
    newEntities[entity] = newEntities[entity].map(generateItemNode);
  });
  return newEntities;
};
/**
 * Calls a node creation helper on each file
 */


exports.prepareNodes = prepareNodes;

const prepareFileNodes = files => {
  const generateFileNode = createNodeFactory('File');
  return files.map(generateFileNode);
};
/**
 * Calls both Gatsby's createNode and gatsby-source-filesystem's
 * createRemoteFileNode on them. Returns an object with both of them,
 * so that they can be linked into Directus's collections.
 */


exports.prepareFileNodes = prepareFileNodes;

const createNodesFromFiles = (files, createNode, createRemoteFileNode, downloadLocalFiles = true) => Promise.all(files.map(async f => {
  if (!downloadLocalFiles) {
    await createNode(f);
    return {
      directus: f
    };
  }

  let localFileNode;

  try {
    localFileNode = await createRemoteFileNode(f);
  } catch (e) {
    error(`Error while downloading files: ${e}`);
  }

  if (localFileNode) {
    f.localFile___NODE = localFileNode.id;
    await createNode(f);
  }

  return {
    directus: f,
    gatsby: localFileNode
  };
})); // Helper for the next function


exports.createNodesFromFiles = createNodesFromFiles;

const containsNullValue = obj => Object.keys(obj).some(key => obj[key] === null);
/**
 * Maps all relations between Directus entities. First we traverse
 * through every relation, and form Many-To-Ones straight away while
 * gathering up all Many-To-Many relations. Afterwards we can iterate
 * over each Many-To-Many relation and build the correct GraphQL nodes.
 */


const mapRelations = (entities, relations, files, showWarningMessages = true, showInfoMessages = true) => {
  const mappedEntities = entities;
  const junctionRelations = {};
  relations.forEach(relation => {
    if (relation.junction_field === null) {
      // Many-to-one, build the relation right away
      const co = relation.collection_one;
      let fo = relation.field_one;
      const cm = relation.collection_many;
      let fm = relation.field_many; // Try to filter out broken relations left over by Directus

      if (!co || !cm) return;

      if (showInfoMessages) {
        info(`Found One-To-Many relation: ${co} -> ${cm}`);
      } // If the relation hasn't been defined in both collections, fall back
      // to using the name of the related collection instead of the relation
      // field


      if (!fo) {
        if (showWarningMessages) {
          warn(`Missing One-To-Many-relation in ${co}. The relation ` + `will be called ${cm} in GraphQL as a best guess.`);
        }

        fo = cm;
      }

      if (!fm) {
        if (showWarningMessages) {
          warn(`Missing Many-To-One-relation in ${cm}. The relation ` + `will be called ${co} in GraphQL as a best guess.`);
        }

        fm = co;
      }

      if (!mappedEntities[co]) mappedEntities[co] = [];

      if (!mappedEntities[cm]) {
        mappedEntities[cm] = [];
      } // Replace each "One" entity with one that contains relations
      // to "Many" entities


      mappedEntities[co] = mappedEntities[co].map(entity => ({ ...entity,
        [`${fo}___NODE`]: mappedEntities[cm].filter(e => e[fm] === entity.directusId).map(e => e.id)
      })); // Same in reverse (each "Many" gets a "One")

      mappedEntities[cm] = mappedEntities[cm].map(entity => {
        const targetEntity = mappedEntities[co].find(e => e.directusId === entity[fm]);
    
        if (!targetEntity) {
          if (showWarningMessages) {
            warn(`Could not find an Many-To-One match in ${co} for item in ${cm} ` + `with id ${entity.directusId}. The field value will be left null.`);
          }

          return entity;
        }

        if(cm.includes('_matrix') && cm !== 'ene_matrix') {

          const fieldName = entity.component_collection;
          const table = mappedEntities[fieldName]
          let matrixEntity;

          if(table) {
            matrixEntity =  table.find(e => e.directusId === entity.component_collection_id);
          }

          if(matrixEntity) {
            entity[`${fieldName}___NODE`] =   matrixEntity.id 
          }
        }

        const newEntity = { ...entity,
          [`${fm}___NODE`]: targetEntity.id
        };
        delete newEntity[fm];
        return newEntity;
      });
    } else {
      // Many-to-many, need to find the pair relations before processing
      const cm = relation.collection_many;

      if (junctionRelations[cm] === undefined) {
        junctionRelations[cm] = [relation];
      } else {
        junctionRelations[cm].push(relation);
      }
    }
  }); // Form the many-to-many relationships

  Object.keys(junctionRelations).forEach(junction => {
    let junctions = junctionRelations[junction];

    if (junctions.length % 2 !== 0) {
      error('Error while building relations for ' + `${junctions[0].collection_many}. ` + 'Please check your Directus Relations collection.');
    }

    if (junctions.length >= 4) {
      // Directus Many-To-Many relational table entries get generated
      // in a weird fashion where there might be redundant entries.
      // For example, if a misconfiguration happens before stumbling
      // upon a working M2M relation, the broken Relation items
      // can still be found in the database.
      junctions = junctions.filter(j => !containsNullValue(j));

      if (junctions.length < 2) {
        error('Error while building relations for ' + `${junctions[0].collection_many}. ` + 'Please check your Directus Relations collection ' + 'and maybe try to delete and remake the relation.');
      } else if (junctions.length > 2) {
        if (showWarningMessages) {
          warn('There seems to be some broken data in the relation for ' + `${junctions[0].collection_many}. ` + 'It might be left over from an earlier misconfiguration, ' + 'we will attempt to use the latest configured settings.');
        }

        junctions = junctions.slice(-2);
      }
    }

    const firstCol = junctions[0].collection_one;
    const secondCol = junctions[1].collection_one;

    if (showInfoMessages) {
      info(`Found Many-To-Many relation: ${firstCol} <-> ${secondCol}`);
    }

    if (junctions.some(containsNullValue)) {
      junctions = junctions.filter(j => !containsNullValue(j));

      if (showWarningMessages) {
        warn(`Only ${junctions[0].collection_one} contains the relational field though.`);
      }
    } // Add relations to both directions


    junctions.forEach(j => mappedEntities[j.collection_many] && mappedEntities[j.collection_many].forEach(relation => {
      // Finds the correct entity and adds the id of related
      // item to the relation list
      const targetCol = j.collection_one;
      const anotherCol = targetCol === firstCol ? secondCol : firstCol;
      const targetItemId = relation[j.field_many];
      const targetKey = `${j.field_one}___NODE`;
      let targetVal; // This gets tricky if the targets are files

      if (anotherCol === 'directus_files') {
        const targetFile = files.find(f => f.directus.directusId === relation[j.junction_field]);

        if (!targetFile) {
          if (showWarningMessages) {
            warn(`Could not find a match for file with id ` + `${relation[j.junction_field]} for field ${j.field_one} ` + `in ${targetCol}. ` + 'The field value will be left null.');
          }

          return;
        }

        targetVal = targetFile.directus.id;
      } else {
        const targetEntity = mappedEntities[anotherCol].find(e => e.directusId === relation[j.junction_field]);

        if (!targetEntity) {
          if (showWarningMessages) {
            warn(`Could not find an Many-To-Many match for item with id ` + `${relation[j.junction_field]} for field ${j.field_one} ` + `in ${targetCol}. ` + `The field value will be left null.`);
          }

          return;
        }

        targetVal = targetEntity.id;
      }

      mappedEntities[targetCol] = mappedEntities[targetCol].map(item => item.directusId === targetItemId ? { ...item,
        [targetKey]: item[targetKey] === undefined ? [targetVal] : [...item[targetKey], targetVal]
      } : item);
    }));
  }); // Remove junction collections as they don't contain relevant data to user anymore

  if (showInfoMessages) {
    info('Cleaning junction collections...');
  }

  Object.keys(junctionRelations).forEach(junction => {
    delete mappedEntities[junction];
  });
  return mappedEntities;
};
/**
 * Iterates through files served by Directus and maps them to all
 * the Collections's Items which are supposed to have an attachment.
 */


exports.mapRelations = mapRelations;

const mapFilesToNodes = (files, collections, entities, showInfoMessages = true) => {
  const newEntities = entities; // Figure out which Collections have fields that need to be
  // mapped to files

  const collectionsWithFiles = [];
  collections.forEach(collection => Object.keys(collection.fields).forEach(field => {
    if (collection.fields[field].type === 'file') {
      collectionsWithFiles.push({
        collectionName: collection.collection,
        fieldName: field
      });
    }
  })); // Map the right field in the right collection to a file node

  collectionsWithFiles.forEach(c => {
    if (showInfoMessages) {
      info(`Mapping files for ${c.collectionName}...`);
    }

    newEntities[c.collectionName] = newEntities[c.collectionName].map(e => {
      const targetFileId = e[c.fieldName];
      const file = files.find(f => f.directus.directusId === targetFileId) || {
        directus: {}
      };
      const fileId = file.directus.id;
      return { ...e,
        [`${c.fieldName}___NODE`]: fileId
      };
    });
  });
  return newEntities;
};
/**
 * Calls Gatsby's createNode on each item in entities
 */


exports.mapFilesToNodes = mapFilesToNodes;

const createNodesFromEntities = async (entities, createNode) => {
  Object.keys(entities).map(async entity => {
    await Promise.all(entities[entity].map(item => createNode(item)));
  });
};

exports.createNodesFromEntities = createNodesFromEntities;