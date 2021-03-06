const isObject = require('lodash/isObject');
const isFunction = require('lodash/isFunction');
const keys = require('lodash/keys');
const jset = require('lodash/set');
const jget = require('lodash/get');
const jtree = require('../utils/jtree');
const hashCode = require('../utils/hash-code');
const schemaList = require('../jar/schema-list');
const GraphNode = require('./graph-node');
const QuerySchema = require('../schema/query-schema');

const initialGraph = {
  head: null,
  tail: null,
  depth: 0,
};

class Graph {
  constructor(structure) {
    this.graph = { ...initialGraph };
    this._createGraphStructure(structure);
  }

  // It will mutate the graph using the query specification.
  _createGraphStructure(structure) {
    const { graph } = this;
    const RGXP_PATH_EMPTY = /^\$$/;
    const RGXP_PATH_ENDS_WITH = /(htm|name|as|alias|properties|\d|where|groupBy|size|page|orderBy)$/;
    const RGXP_PATH_CONTAINS = /(where).*?\w+$/;
    jtree(structure, (node, path) => {
      // If empty path, or end with "..." or have some specific keywords in the middle of it.
      if (RGXP_PATH_EMPTY.test(path)
        || RGXP_PATH_ENDS_WITH.test(path)
        || RGXP_PATH_CONTAINS.test(path)) return;
      // Resolve the actual node schema name.
      const schemaName = path.split('.').pop();
      // Resolve the schema from the schemas list using its name.
      const schema = schemaList.getSchema(schemaName);
      // Creates a new hash code for the current specific node.
      const nodeHash = hashCode();
      // Check if the actual node is the first from the graph.
      const isRoot = /^\$\.\w+$/.test(path);
      // Parent schema will be present in the path when there is more than 1 ".", in that case
      // resolve the parent schema name to access the previous graph node.
      const parentSchemaName = !isRoot ? path.split('.').slice(-2, -1).shift() : null;
      // Create a new QuerySchema which represents the node schema and some
      // merged options and methods.
      this._addGraphNode(schemaName, nodeHash, new QuerySchema({
        schema,
        // Query Node specific attributes.
        useProperties: node.properties,
        ignoreId: !isRoot,
        displayAs: node.as,
        options: {
          where: node.where,
          size: node.size,
          page: node.page,
          groupBy: node.groupBy,
          orderBy: node.orderBy,
        },
        // Hightlight text match array.
        htm: node.htm,
      }), parentSchemaName);
    });
    return graph;
  }

  _addGraphNode(name = '', hash = hashCode(), value = {}, parent) {
    const { graph } = this;
    // Set the graph head node hash when not defined yet.
    if (!graph.head) jset(graph, 'head', hash);
    // Resolve parent node from the graph.
    const parentNode = !parent ? null : (this.getNodeByName(parent) || this.getNodeByHash(parent));
    // Creates a new node.
    const node = new GraphNode({
      name,
      hash,
      root: graph.head === hash,
      value,
      parent: parentNode,
    });
    // Adds the new created node to the graph.
    jset(graph, hash, node);
    // Add the current node hash inside the previous node "nextNodes" array. It will
    // show the way to walk into the graph.
    if (parentNode) parentNode.addChildren(node);
    // Updates the tail.
    jset(graph, 'tail', hash);
  }

  getNodeByName(name) {
    const { graph } = this;
    const match = keys(graph).find((nodeHash) => {
      if (isObject(graph[nodeHash]) && graph[nodeHash].name === name) {
        return true;
      }
      return false;
    });
    return match ? jget(graph, match) : null;
  }

  getNodeByHash(hash) {
    const { graph } = this;
    return jget(graph, hash);
  }

  getHead() {
    const { graph } = this;
    const headHash = graph.head;
    return graph[headHash];
  }

  getTail() {
    const { graph } = this;
    const tailHash = graph.tail;
    return graph[tailHash];
  }

  getGraphNodesHashes() {
    const { graph } = this;
    return keys(graph).filter(hash => !/^(head|tail|depth)$/.test(hash));
  }

  getNodeSchemaByAlias(alias) {
    const graphNodesHashes = this.getGraphNodesHashes();
    const matchedHash = graphNodesHashes.find((hash) => {
      const node = this.getNodeByHash(hash);
      const schema = node.getValue();
      return schema.tableHash === alias;
    });
    if (matchedHash) {
      return this.getNodeByHash(matchedHash).getValue();
    }
    return null;
  }

  resolveGraph(options, resolverName) {
    return this.getHead().resolveNode(options, resolverName);
  }

  walk(walker) {
    const walk = (node) => {
      if (!node) return;
      if (isFunction(walker)) {
        walker(node);
      }
      const { nextNodes } = node;
      if (nextNodes && nextNodes.length) {
        nextNodes.forEach(child => walk(child));
      }
    };
    return walk(this.getHead());
  }
}

module.exports = Graph;
