const assign = require('lodash/assign');
const isFunction = require('lodash/isFunction');
const isObject = require('lodash/isObject');
const isArray = require('lodash/isArray');
const keys = require('lodash/keys');
const jset = require('lodash/set');
const schemaList = require('./jar/schema-list');
const queryList = require('./jar/query-list');
const jtree = require('./utils/jtree');
const {
  RESPONSE_OBJECT_NAME,
  COUNT_RESPONSE_FIELD_NAME,
  GRAPHLITE_CONNECTION_EXECUTER_NAME,
  TOTAL_ROWS_COUNT_PROPERTY_NAME,
} = require('./constants');

const parseResponseRowObject = (row) => {
  const shadow = {};
  const object = JSON.parse(row[RESPONSE_OBJECT_NAME]);
  // Parse each property value/index of the object.
  jtree(object, (value, path) => {
    // ignore when begin path, value is array or it represents a object inside array.
    if (/^\$$/.test(path) || isArray(value) || /\d$/.test(path)) return;
    let prop = path.match(/\w+\.\w+$/)[0].split('.');
    const [schemaAlias, propName] = prop;
    // Resolve the property schema.
    const schema = schemaList.getSchemaByAlias(schemaAlias);
    // Get the schema property instance by the property name.
    prop = schema.getProperty(propName);
    // Resolve the property value.
    const propValue = prop.parseValue(value);
    // Transform the path string representation to use with the
    // lodash "set" function.
    const objectPath = path
      .replace(/#(\d{1,})/g, '[$1]')
      .replace(/^\$\.?/, '')
      .replace(/\w+\.(\w+)$/, '$1');
    // Set the new parsed value into the shadow of the actual row object.
    jset(shadow, objectPath, propValue);
  });
  return shadow;
};

const parseResponseRows = (rows) => {
  const parsedRows = rows.map(row => parseResponseRowObject(row));
  return {
    rows: parsedRows,
    count: parsedRows.length,
  };
};

const parseCountResponse = (rows) => {
  const [row] = rows;
  return typeof row === 'object' ? row[COUNT_RESPONSE_FIELD_NAME] : 0;
};

class GraphLite {
  constructor({
    schemas,
    queries,
    associations,
    locales,
    defaultLanguage,
    connection,
  }) {
    const supportedLocales = isObject(locales) ? keys(locales) : {};

    assign(this, {
      connection,
      supportedLocales,
      locales,
      locale: defaultLanguage || supportedLocales[0],
    });

    this._defineSchemasFromArrayList(schemas);
    this._useAssociationFunction(associations);
    this._defineQueriesFromArrayList(queries);
  }

  _defineSchemasFromArrayList(schemas = []) {
    schemas.forEach(schema => schemaList.defineSchema(schema));
  }

  _defineQueriesFromArrayList(queries = []) {
    queries.forEach(query => queryList.defineQuery(query));
  }

  _useAssociationFunction(useAssociation) {
    if (isFunction(useAssociation)) {
      const schemas = schemaList.getSchemaList();
      useAssociation(schemas);
    }
  }

  _getQuery(queryName) {
    return queryList.getQuery(queryName);
  }

  _mountQuery(queryName, options = {}) {
    const query = this._getQuery(queryName);
    return query.resolve(options);
  }

  _mountCountQuery(queryName, options = {}) {
    const query = this._getQuery(`${queryName}-count`);
    return query.resolve(options);
  }

  _executeQuery(query) {
    const { connection } = this;
    return isFunction(connection)
      ? connection(query)
      : connection[GRAPHLITE_CONNECTION_EXECUTER_NAME](query);
  }

  _run(queryName, options = {}) {
    const executeQuery = this._executeQuery.bind(this);
    const mainQuery = this._mountQuery(queryName, options);
    const countQuery = this._mountCountQuery(queryName, options);
    const fetchData = () => executeQuery(mainQuery).then(parseResponseRows);
    const fetchDataCount = () => executeQuery(countQuery).then(parseCountResponse);
    const shouldCount = (typeof options.count !== 'undefined' && options.count === false) ? false : true;
    const isFirstPage = options.page === 1;
    return fetchData().then((rows) => {
      // Run another query to count the total number of rows that can be listed by the query.
      if (isFirstPage && shouldCount) {
        // Merge the data from the two executed queries:
        return fetchDataCount().then(totalCount => ({
          ...rows,
          [TOTAL_ROWS_COUNT_PROPERTY_NAME]: totalCount,
        }));
      }
      return rows;
    });
  }

  // Public API
  findOne(queryName, options) {
    return this._run(queryName, {
      ...options,
      size: 1,
    });
  }

  findAll(queryName, options) {
    return this._run(queryName, options);
  }

  // defineSchema() {}
  // defineQuery() {}

  setLocale(locale) {
    const { locales } = this;
    if (!locales.includes(locale)) {
      throw new Error(`Unsupported locale "${locale}".`);
    }
    this.locale = locale;
  }
}

module.exports = GraphLite;
