const assign = require('lodash/assign');

const DEFAULT_RESOLVER_NAME = 'root';

const useSQLiteResolvers = () => {
  const SQLiteGraphNodeRootResolver = require('../resolvers/sqlite/root-resolver');
  const SQLiteGraphNodeNodeResolver = require('../resolvers/sqlite/node-resolver');
  const SQLiteGraphNodeRootSourceWithAssociationsResolver = require('../resolvers/sqlite/root-source-with-associations-resolver');
  const SQLiteGraphNodeSourceWithAssociationsResolver = require('../resolvers/sqlite/node-source-with-associations-resolver');
  const SQLiteGraphNodeRootOptionsResolver = require('../resolvers/sqlite/root-options');
  return {
    root: SQLiteGraphNodeRootResolver,
    node: SQLiteGraphNodeNodeResolver,
    rootSourceWithAssociations: SQLiteGraphNodeRootSourceWithAssociationsResolver,
    nodeSourceWithAssociations: SQLiteGraphNodeSourceWithAssociationsResolver,
    rootOptions: SQLiteGraphNodeRootOptionsResolver,
  };
};

const useSQLitePatcher = () => {
  const SQLiteGraphNodePatchResolver = require('../resolvers/sqlite/patch-resolver');
  return SQLiteGraphNodePatchResolver;
};

class GraphNode {
  constructor({
    name,
    hash,
    value = {
      schema: null,
    },
    parent,
    root,
  }) {
    assign(this, {
      name,
      hash,
      value,
      nextNodes: [],
      parent,
      root: !!root,
      // create a list of resolvers and patchers
      resolvers: useSQLiteResolvers(),
      patcher: useSQLitePatcher(),
    });
  }

  addChildren(node) {
    this.nextNodes.push(node);
  }

  isRoot() {
    return !!this.root;
  }

  _getResolver(name) {
    const { resolvers } = this;
    if (!resolvers[name]) {
      throw new Error(`Undefined "${name}" resolver.`);
    }
    return this.resolvers[name];
  }

  _renderFromResolver(resolver, queryOptions = {}, node = this, options = {
    usePatch: false,
  }) {
    const nodeValue = node.getValue();
    const resolveNextNodes = node.resolveNextNodes.bind(node, resolver, queryOptions, options);
    const resolveNode = node.resolveNode.bind(node, queryOptions);
    return resolver(nodeValue, queryOptions, node, resolveNextNodes, resolveNode);
  }

  getParent() {
    return this.parent;
  }

  getValue() {
    return this.value;
  }

  getNextNodes() {
    return this.nextNodes;
  }

  // When a node resolver is called this function will be passed in the arguments list
  // in case when the resolver must resolve another specific resolver from inside it.
  // When this function is called it will resolve the nodes from the root(always).
  resolveNode(queryOptions = {}, resolverName = DEFAULT_RESOLVER_NAME, options) {
    return this._renderFromResolver(this._getResolver(resolverName), queryOptions, this, options);
  }

  /**
   *
   * Function passed to the resolver. When called it will resolve a list(array) representing
   * the next nodes of the node which called it. It will use the same resolver function to
   * render the next nodes.
   *
   * @param {function} resolver Represents the resolver(defined in the root resolve node).
   * @param {object} queryOptions Object containing the filters to use with query.
   * @param {object} options Specific options for graph builder.
   */
  resolveNextNodes(resolver, queryOptions = {}, options) {
    const { nextNodes, patcher } = this;
    const resolvedNodes = nextNodes.map(node => this._renderFromResolver(
      resolver,
      queryOptions,
      node,
      options,
    ));
    return options.usePatch ? patcher(resolvedNodes) : resolvedNodes.join(' ');
  }
}

module.exports = GraphNode;
