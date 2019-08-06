const translatePropsToObject = require('./helpers/translate-props-to-object');
const translatePropsToFields = require('./helpers/translate-props-to-fields');
const resolveOptions = require('./helpers/resolve-options');
const {
  ROW_MATCH_OBJECT_KEY_NAME,
} = require('../../constants');

const SQLiteGraphNodeNestedNodeResolver = (
  schema,
  options,
  node,
  resolveNextNodes,
  resolveNode,
) => {
  // As this resolver is called from the root node it will render for the root node too.
  // So it must be ignored when this resolver is called for the root node.
  if (node.isRoot()) return resolveNextNodes();

  const optionsTypes = ['limit', 'offset', 'groupBy', 'orderBy'];

  const tableAlias = schema.getTableHash();
  let objectFields = translatePropsToObject(schema.getDefinedProperties(), tableAlias);
  let rawFields = translatePropsToFields(schema.getDefinedProperties(), tableAlias, options);
  const parentSchema = node.parent.getValue();
  const parentSchemaName = parentSchema.getSchemaName();
  const resolvedAssociation = schema.getAssociationWith(parentSchemaName);
  const { objectType } = resolvedAssociation;
  // Resolve the node options ignoring the 'where' clause as it will be already
  // rendered by the graph root node.
  const resolvedOptions = resolveOptions(schema, options, node, optionsTypes);
  const resolvedNextNodes = resolveNextNodes();

  // Resolve the key name that represents the array/object data.
  const schemaDisplayName = schema.getDisplayName();

  // Support nested object/array match highlight.
  // When query options constains a value that refers to any of this node filters
  // we add a match property to the node response object which means that
  // the specific result was found by a match using the filter.
  const conditions = resolveOptions(schema, options, node, ['where']);
  const containsWhereConditions = /^\s{0,}where/i.test(conditions);
  if (containsWhereConditions) {
    objectFields = `'${tableAlias}.${ROW_MATCH_OBJECT_KEY_NAME}', ${tableAlias}.${ROW_MATCH_OBJECT_KEY_NAME}, ${objectFields}`;
    rawFields += `, CAST(${conditions.replace(/where/i, '')} AS boolean) AS ${ROW_MATCH_OBJECT_KEY_NAME}`;
  }

  if (objectType === 'array') {
    const sourceWithAssociations = resolveNode('nodeSourceWithAssociations');

    // When the node have group by condition it must group (using json_group_array function)
    // the ids from all the others associated schemas and return it to be avaiable to
    // the next nodes.
    if (/group by/i.test(resolvedOptions) && resolvedAssociation.using.length) {
      const associationList = [resolvedAssociation].concat(resolvedAssociation.using);
      rawFields += `, ${associationList.map(({
        targetHash, targetKey,
      }) => `json_group_array(${targetHash}.${targetKey}) as id_${targetHash}`).join(',')}`;
    }

    return `
      /* begin ${tableAlias} node */
      SELECT
        json_object(
          '${schemaDisplayName}',
          (
            SELECT
              json_group_array(
                json_patch(
                  json_object(${objectFields}),
                  (${resolvedNextNodes})
                )
              )
            FROM (
              SELECT
                ${rawFields}
              ${sourceWithAssociations}
              ${resolvedOptions}
            ) ${tableAlias}
          )
        )
      /* end ${tableAlias} node */
    `;
  }

  // Resolve node query when is "object" type
  // ...

  const associationWithParent = resolveNode('nodeSourceWithAssociations');
  // When there is no middleware tables between the association,
  // it renders the node source directly. It select the parent identifiers
  // to make a directly join.
  return `
    /* begin ${tableAlias} node */
    SELECT
        json_object(
          ${objectFields}
        )
      /* begin ${tableAlias} join */
      ${associationWithParent}
      /* end ${tableAlias} join */
      ${resolvedOptions}
    /* end ${tableAlias} node */
  `;
};

module.exports = SQLiteGraphNodeNestedNodeResolver;
