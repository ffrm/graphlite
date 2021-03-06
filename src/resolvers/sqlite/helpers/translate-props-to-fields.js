const keys = require('lodash/keys');

// Returns the prop definition as pattern: 'propName', someTableRandomHash.propColumnName
const translatePropsToFields = (props, schemaHash, queryOptions) => keys(props).map((propName) => {
  const prop = props[propName];
  return schemaHash.concat('.').concat(prop.getPropertyColumnName(queryOptions));
}).join(',');

module.exports = translatePropsToFields;
