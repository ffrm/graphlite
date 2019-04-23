const _ = require('./utils');
const Schema = require('./schema');
const Query = require('./query/query');
const debug = require('./debugger');

const DEFAULT_ROW_NAME = 'response';
const DEFAULT_ROW_COUNT_NAME = 'count';
const DEFAULT_OBJECT_RESPONSE_NAME = 'rows';
const DEFAULT_COUNT_OBJECT_RESPONSE_NAME = 'total';
const DEFAULT_CONNECTION_PROVIDER_QUERY_RUNNER_NAME = 'run';
const DEFAULT_OPTIONS_PAGE = 1;

class GraphLite {

  constructor(opts) {
    _.xtend(this, {
      _connection: opts.connection,
      _schema: _.defaults(opts.schema, [], (schemas) => {
        return schemas.map(schema => this.defineSchema(schema));
      }),
      _queries: _.defaults(opts.queries, [], (queries) => {
        return queries.map(query => this.defineQuery(query));
      }),
      _options: {},
    });
  }

  _schemaProvider(schemaName) {
    return this._schema.find(schema => schema.name === schemaName);
  }

  // Extra options(b) represents the second object received by the find
  // functions. In this object there are page, size and some extra params.
  _mergeOptions(a = {}, b = {}) {
    return _.pickBy(_.xtend({}, a, {
      page: b.page || DEFAULT_OPTIONS_PAGE,
      size: b.size,
      withCount: b.withCount
    }));
  }

  _getQueryByName(queryName) {
    return this._queries.find(query => query.name === queryName);
  }

  _executeQueryOnDatabase(query) {
    const connectionProviderQueryRunnerName = DEFAULT_CONNECTION_PROVIDER_QUERY_RUNNER_NAME;
    if (!this._connection) {
      throw new Error(`There is no database connection to run the query!`);
    } else if (!_.isFunction(this._connection[connectionProviderQueryRunnerName])) {
      throw new Error(`Unknown "${connectionProviderQueryRunnerName}" method on the connection provider instance!`);
    }
    return this._connection[connectionProviderQueryRunnerName](query);
  }

  _parseRowsFromDatabase(rows, rowObjectName) {
    rows = rows.map(row => JSON.parse(row[rowObjectName]));
    // Specific: When rows represent the total count of the collection,
    // it just return the first row value (which contains the count).
    return (rowObjectName === DEFAULT_ROW_COUNT_NAME) ? rows[0] : rows;
  }

  _translateRowsToObject(rows, responseObjectName) {
    return { [responseObjectName]: rows };
  }

  _executeQueryWithOptions(queryName, options = {}) {
    // Resolve query schema from the list.
    const query = this._getQueryByName(queryName);

    // Check if query really exists.
    if (!query) throw new Error(`Undefined ${queryName} query!`);

    // Must build and run a specific query for total count?
    const withCount = (_.isBoolean(options.count) && !options.count) ? false : (options.page === 1) ? true : false;

    // #
    const buildAndRunQuery = () => {
      const buildedQuery = query.buildQuery(options);
      return this._executeQueryOnDatabase(buildedQuery)
        .then(rows => this._parseRowsFromDatabase(rows, DEFAULT_ROW_NAME))
        .then(rows => query.parseRows(rows))
        .then(rows => this._translateRowsToObject(rows, DEFAULT_OBJECT_RESPONSE_NAME));
    }

    // #
    const buildAndRunCountQuery = (data) => {
      const buildedCountQuery = query.buildCountQuery(options);
      return this._executeQueryOnDatabase(buildedCountQuery)
        .then(rows => this._parseRowsFromDatabase(rows, DEFAULT_ROW_COUNT_NAME))
        .then(rows => this._translateRowsToObject(rows, DEFAULT_COUNT_OBJECT_RESPONSE_NAME))
        .then(rows => _.xtend(rows, data));
    }

    const tasks = [
      buildAndRunQuery,
      withCount ? buildAndRunCountQuery : null
    ];

    // Execute query list sync then return.
    return tasks.reduce((promise, task) => {
      return promise = promise.then(task);
    }, Promise.resolve());
  }

  // ## Public methods
  findOne(queryName, options = {}, extraOptions = {}) {
    extraOptions.size = 1;
    return this._executeQueryWithOptions(queryName, this._mergeOptions(options, extraOptions));
  }

  findAll(queryName, options = {}, extraOptions = {}) {
    return this._executeQueryWithOptions(queryName, this._mergeOptions(options, extraOptions));
  }

  defineSchema(name, opts) {
    const schemaProvider = this._schemaProvider.bind(this);
    opts = _.isObject(name) ? name : opts;
    name = _.isObject(name) ? name.name : name;
    const schema = new Schema(name, opts, schemaProvider);
    this._schema.push(schema);
    return schema;
  }

  defineQuery(name, graph) {
    const schemaProvider = this._schemaProvider.bind(this);
    graph = _.isObject(name) ? name : graph;
    name = _.isObject(name) ? name.name : name;
    const query = new Query(name, graph, schemaProvider);
    this._queries.push(query);
    return query;
  }

}

module.exports = GraphLite;

