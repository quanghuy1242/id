import { existsSync } from "node:fs";

var STORAGE_ERROR_PATTERNS = [
  /UNIQUE constraint failed/i,
  /\bSQLite\b/i,
  /\bD1\b/i,
  /\bDrizzle\b/i,
];

var ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

function getLayer(filename) {
  var srcIndex = filename.lastIndexOf("/src/");
  if (srcIndex === -1) return null;
  var afterSrc = filename.slice(srcIndex + 5);
  var slashIndex = afterSrc.indexOf("/");
  if (slashIndex === -1) return null;
  return afterSrc.slice(0, slashIndex);
}

function isRouteModule(filename) {
  return /.+\/http\/routes\/.+\.routes\.ts$/.test(filename);
}

function isRepositoryOrWorkflow(filename) {
  return /.+\/infrastructure\/repositories\/drizzle-.+\.(repository|workflow)\.ts$/.test(filename);
}

function isMapperFile(filename) {
  return /.+\/repositories\/mappers\/.+\.mapper\.ts$/.test(filename);
}

function isCrudAdapter(filename) {
  return filename.endsWith("/infrastructure/persistence/crud-adapter.ts");
}

function startsWithAny(str, prefixes) {
  return prefixes.some(function (p) { return str.startsWith(p); });
}

function extractImportSource(node) {
  if (node.source && node.source.type === "Literal") {
    return node.source.value;
  }
  return null;
}

function getImportedNames(node) {
  var names = [];
  if (!node.specifiers) return names;
  for (var i = 0; i < node.specifiers.length; i++) {
    var specifier = node.specifiers[i];
    if (specifier.type !== "ImportSpecifier") continue;
    var imported = specifier.imported;
    if (!imported) continue;
    if (imported.type === "Identifier") names.push(imported.name);
    if (imported.type === "Literal" && typeof imported.value === "string") names.push(imported.value);
  }
  return names;
}

function getPropertyName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return null;
}

function isThisDbExpression(node) {
  return node &&
    node.type === "MemberExpression" &&
    !node.computed &&
    node.object &&
    node.object.type === "ThisExpression" &&
    getPropertyName(node.property) === "db";
}

function findDescendants(root, predicate) {
  var matches = [];
  var visited = new Set();
  function walk(n) {
    if (!n || typeof n !== "object") return;
    if (visited.has(n)) return;
    visited.add(n);
    if (predicate(n)) matches.push(n);
    var keys = Object.keys(n);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === "parent") continue;
      var val = n[key];
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (var j = 0; j < val.length; j++) walk(val[j]);
        } else if (val.type) {
          walk(val);
        }
      }
    }
  }
  walk(root);
  return matches;
}

function getInlineRouteHandlerBody(node) {
  if (!node || node.type !== "CallExpression") return null;
  var callee = node.callee;
  if (callee.type !== "MemberExpression" || callee.computed) return null;
  if (callee.object.type !== "Identifier" || callee.object.name !== "app") return null;
  var prop = getPropertyName(callee.property);
  if (prop === "all") {
    var handler = node.arguments[1];
    var isArrow = handler && handler.type === "ArrowFunctionExpression";
    var isFunc = handler && handler.type === "FunctionExpression";
    if (!isArrow && !isFunc) return null;
    return handler.body;
  }
  if (ROUTE_METHODS.has(prop)) {
    var handler = node.arguments[1];
    var isArrow = handler && handler.type === "ArrowFunctionExpression";
    var isFunc = handler && handler.type === "FunctionExpression";
    if (!isArrow && !isFunc) return null;
    return handler.body;
  }
  return null;
}

function hasJSDoc(context, node) {
  var comments = context.sourceCode.getCommentsBefore(node);
  for (var i = 0; i < comments.length; i++) {
    var v = comments[i].value;
    if (v.charAt(0) === "*") return true;
  }
  return false;
}

function reportProgramError(context, message) {
  context.report({
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    message: message,
  });
}

// ─── Rule 1: layer-imports ────────────────────────────────────────────────
var layerImportsRule = {
  meta: {
    type: "problem",
    docs: { description: "Enforce layer dependency boundaries" },
    schema: [{
      type: "object",
      properties: {
        internalAllowed: { type: "object" },
        externalBanned: { type: "object" },
      },
    }],
  },
  create: function (context) {
    var opts = context.options[0] || {};
    var internalAllowed = opts.internalAllowed || {};
    var externalBanned = opts.externalBanned || {};
    var filename = context.filename || context.physicalFilename || "";
    var layer = getLayer(filename);

    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (!spec) return;

        if (spec.startsWith("@/") && layer && internalAllowed[layer]) {
          if (!startsWithAny(spec, internalAllowed[layer])) {
            context.report({ node: node.source, message: "Disallowed " + layer + " import: " + spec });
          }
        }

        if (!spec.startsWith("@/") && layer && externalBanned[layer]) {
          var banned = externalBanned[layer];
          for (var i = 0; i < banned.length; i++) {
            var p = banned[i];
            if (typeof p === "string") {
              var starts = spec === p || (spec.length > p.length && spec.slice(0, p.length) === p && (spec[p.length] === "/" || spec[p.length] === ":"));
              if (starts) {
                context.report({ node: node.source, message: "Disallowed external import in " + layer + " layer: " + spec });
                break;
              }
            }
          }
        }
      },

      ExportNamedDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (!spec || !spec.startsWith("@/") || !layer || !internalAllowed[layer]) return;
        if (!startsWithAny(spec, internalAllowed[layer])) {
          context.report({ node: node.source, message: "Disallowed " + layer + " re-export: " + spec });
        }
      },

      ExportAllDeclaration: function (node) {
        if (!node.source || node.source.type !== "Literal") return;
        var spec = node.source.value;
        if (!spec.startsWith("@/") || !layer || !internalAllowed[layer]) return;
        if (!startsWithAny(spec, internalAllowed[layer])) {
          context.report({ node: node.source, message: "Disallowed " + layer + " re-export: " + spec });
        }
      },
    };
  },
};

// ─── Rule 2: no-mapper-imports-outside-infra ──────────────────────────────
var noMapperImportsOutsideInfraRule = {
  meta: { type: "problem", docs: { description: "Mapper imports only inside infrastructure" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (filename.includes("/infrastructure/")) return {};
    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (spec && spec.includes("/repositories/mappers/")) {
          context.report({ node: node.source, message: "Mapper imports are only allowed inside infrastructure: " + spec });
        }
      },
    };
  },
};

// ─── Rule 3: no-storage-error-parsing ─────────────────────────────────────
var noStorageErrorParsingRule = {
  meta: { type: "problem", docs: { description: "Storage error parsing stays in infrastructure" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!/\/src\/(application|domain|http|shared)\//.test(filename)) return {};
    if (filename.endsWith("/src/shared/errors.ts")) return {};
    return {
      Literal: function (node) {
        if (typeof node.value !== "string") return;
        for (var i = 0; i < STORAGE_ERROR_PATTERNS.length; i++) {
          if (STORAGE_ERROR_PATTERNS[i].test(node.value)) {
            context.report({ node: node, message: "Storage-driver parsing terms must stay in infrastructure helpers: " + node.value });
            return;
          }
        }
      },
      TemplateElement: function (node) {
        var value = node.value && (node.value.cooked || node.value.raw);
        if (typeof value !== "string") return;
        for (var i = 0; i < STORAGE_ERROR_PATTERNS.length; i++) {
          if (STORAGE_ERROR_PATTERNS[i].test(value)) {
            context.report({ node: node, message: "Storage-driver parsing terms must stay in infrastructure helpers: " + value });
            return;
          }
        }
      },
    };
  },
};

// ─── Rule 4: no-custom-errors-outside-shared ──────────────────────────────
var noCustomErrorsOutsideSharedRule = {
  meta: { type: "problem", docs: { description: "Custom errors must be in shared/errors.ts" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (filename.endsWith("/src/shared/errors.ts")) return {};
    return {
      ClassDeclaration: function (node) {
        if (!node.id || !node.superClass) return;
        if (node.superClass.type === "Identifier") {
          var name = node.superClass.name;
          if (name === "Error" || name === "AppError") {
            context.report({ node: node.id, message: "Custom error classes must live in src/shared/errors.ts" });
          }
        }
      },
    };
  },
};

// ─── Rule 8: route-handler-boundary ──────────────────────────────────────
var ROUTE_FORBIDDEN_STORAGE_METHODS = new Set(["batch", "delete", "exec", "insert", "prepare", "select", "update"]);

function isCEnvAccess(node) {
  return node &&
    node.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    node.object.name === "c" &&
    getPropertyName(node.property) === "env";
}

function isJsonParseOrStringifyCall(node) {
  return node &&
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "JSON" &&
    (getPropertyName(node.callee.property) === "parse" || getPropertyName(node.callee.property) === "stringify");
}

function isStorageLikeCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  if (node.callee.type !== "MemberExpression" || node.callee.computed) return false;
  return ROUTE_FORBIDDEN_STORAGE_METHODS.has(getPropertyName(node.callee.property));
}

var routeHandlerBoundaryRule = {
  meta: { type: "problem", docs: { description: "Route handlers stay at HTTP orchestration boundaries" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!isRouteModule(filename)) return {};

    return {
      CallExpression: function (node) {
        var handlerBody = getInlineRouteHandlerBody(node);
        if (!handlerBody) return;

        var envAccesses = findDescendants(handlerBody, isCEnvAccess);
        for (var e = 0; e < envAccesses.length; e++) {
          context.report({ node: envAccesses[e], message: "Route handlers must not read c.env directly; use composition/use cases for runtime dependencies" });
        }

        var lowLevelCalls = findDescendants(handlerBody, function (n) {
          if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "fetch") return true;
          if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && !n.callee.computed && n.callee.object.type === "Identifier" && n.callee.object.name === "crypto") return true;
          if (isJsonParseOrStringifyCall(n)) return true;
          if (isStorageLikeCall(n)) return true;
          return false;
        });

        for (var i = 0; i < lowLevelCalls.length; i++) {
          context.report({ node: lowLevelCalls[i], message: "Route handlers must stay thin: validate input, call one use case, and present the response" });
        }

        var lowLevelNews = findDescendants(handlerBody, function (n) {
          return n.type === "NewExpression" &&
            n.callee.type === "Identifier" &&
            (n.callee.name === "Request" || n.callee.name === "Response");
        });

        for (var r = 0; r < lowLevelNews.length; r++) {
          context.report({ node: lowLevelNews[r], message: "Route handlers must use Hono response helpers and presenters, not construct Request/Response directly" });
        }
      },
    };
  },
};

// ─── Rule 9: repository-workflow ──────────────────────────────────────────
var repositoryWorkflowRule = {
  meta: { type: "problem", docs: { description: "Repository and workflow rules" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!isRepositoryOrWorkflow(filename)) return {};
    var mapperImports = 0;
    var isWorkflow = /.+\.workflow\.ts$/.test(filename);
    var dbWriteMethods = new Set(["insert", "update", "delete"]);

    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (spec && spec.includes("/repositories/mappers/")) mapperImports++;
        if (spec && /\/domain\/.+\.policy$/.test(spec)) {
          context.report({ node: node.source, message: "Repositories and workflows must not own authorization decisions" });
        }
      },
      CallExpression: function (node) {
        if (node.callee.type === "MemberExpression" && !node.callee.computed) {
          if (node.callee.property.type === "Identifier" && node.callee.property.name === "reconstitute") {
            context.report({ node: node, message: "Repositories and workflows must reconstitute entities through mappers, not inline" });
          }
          if (isThisDbExpression(node.callee.object) && dbWriteMethods.has(getPropertyName(node.callee.property))) {
            context.report({ node: node, message: "Repository and workflow writes must go through CrudAdapter helpers" });
          }
          if (!isWorkflow && isThisDbExpression(node.callee.object) && getPropertyName(node.callee.property) === "batch") {
            context.report({ node: node, message: "db.batch(...) is only allowed in infrastructure workflow ports" });
          }
        }
      },
      "Program:exit": function () {
        if (mapperImports === 0) {
          reportProgramError(context, "Repository and workflow implementations must use infrastructure mappers");
        }
      },
    };
  },
};

// ─── Rule 10: mapper-file ─────────────────────────────────────────────────
var mapperFileRule = {
  meta: { type: "problem", docs: { description: "Mapper function rules" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!isMapperFile(filename)) return {};

    var exportedFunctions = [];
    var disallowedImports = [];
    var hasDomainEntityImport = false;

    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (!spec) return;
        if (spec.startsWith("@/application/") || spec.startsWith("@/http/") || spec.startsWith("@/composition/")) {
          disallowedImports.push(spec);
        }
        if (/\/domain\/.+\.entity$/.test(spec)) {
          hasDomainEntityImport = true;
        }
      },

      ExportNamedDeclaration: function (node) {
        if (node.declaration && node.declaration.type === "FunctionDeclaration" && node.declaration.id) {
          exportedFunctions.push(node.declaration);
        }
      },

      ExportDefaultDeclaration: function (node) {
        if (node.declaration && node.declaration.type === "FunctionDeclaration" && node.declaration.id) {
          exportedFunctions.push(node.declaration);
        }
      },

      "Program:exit": function () {
        for (var d = 0; d < disallowedImports.length; d++) {
          reportProgramError(context, "Mapper files must stay in infrastructure/domain boundaries only: " + disallowedImports[d]);
        }

        for (var i = 0; i < exportedFunctions.length; i++) {
          var fn = exportedFunctions[i];
          var name = fn.id.name;

          var paramSet = new Set();
          for (var p = 0; p < fn.params.length; p++) {
            if (fn.params[p].type === "Identifier") paramSet.add(fn.params[p].name);
          }

          if (/RowToEntity$|ToInsertRow$|ToUpdateRow$|RowToRecord$/.test(name) && fn.params.length !== 1) {
            context.report({ node: fn.id, message: "Mapper function " + name + " must accept exactly one argument" });
          }

          if (fn.params.length > 1) {
            context.report({ node: fn.id, message: "Mapper function " + name + " must not accept ad hoc scalar arguments" });
          }

          if (fn.body) {
            var returnStmts = findDescendants(fn.body, function (n) {
              return n.type === "ReturnStatement" && n.argument !== null && typeof n.argument !== "undefined";
            });

            for (var r = 0; r < returnStmts.length; r++) {
              var expr = returnStmts[r].argument;
              if (expr.type === "Identifier" && paramSet.has(expr.name)) {
                context.report({ node: expr, message: "Mapper function " + name + " must map fields explicitly instead of returning " + expr.name + " directly" });
              }
              if (expr.type === "ObjectExpression") {
                for (var j = 0; j < expr.properties.length; j++) {
                  var prop = expr.properties[j];
                  if (prop.type === "SpreadElement" && prop.argument.type === "Identifier" && paramSet.has(prop.argument.name)) {
                    context.report({ node: prop, message: "Mapper function " + name + " must map fields explicitly instead of spreading " + prop.argument.name });
                  }
                }
              }
            }
          }

          if (!hasDomainEntityImport) continue;

          if (name.endsWith("RowToEntity")) {
            if (fn.body) {
              var reconCalls = findDescendants(fn.body, function (n) {
                return n.type === "CallExpression" &&
                  n.callee.type === "MemberExpression" &&
                  !n.callee.computed &&
                  n.callee.property.type === "Identifier" &&
                  n.callee.property.name === "reconstitute";
              });
              if (reconCalls.length === 0) {
                context.report({ node: fn.id, message: "Mapper " + name + " must rebuild through Entity.reconstitute(...)" });
              }
            } else {
              context.report({ node: fn.id, message: "Mapper " + name + " must rebuild through Entity.reconstitute(...)" });
            }
          }

          if (name.endsWith("ToInsertRow") || name.endsWith("ToUpdateRow")) {
            if (fn.body) {
              var snapCalls = findDescendants(fn.body, function (n) {
                return n.type === "CallExpression" &&
                  n.callee.type === "MemberExpression" &&
                  !n.callee.computed &&
                  n.callee.property.type === "Identifier" &&
                  n.callee.property.name === "toSnapshot";
              });
              if (snapCalls.length === 0) {
                context.report({ node: fn.id, message: "Mapper " + name + " must derive persistence rows from entity.toSnapshot()" });
              }
            } else {
              context.report({ node: fn.id, message: "Mapper " + name + " must derive persistence rows from entity.toSnapshot()" });
            }
          }
        }
      },
    };
  },
};

// ─── Rule 11: entity-class ────────────────────────────────────────────────
function isEntityFile(filename) {
  return /.+\/domain\/.+\.entity\.ts$/.test(filename);
}

function isExported(node) {
  if (!node.parent) return false;
  return node.parent.type === "ExportNamedDeclaration" || node.parent.type === "ExportDefaultDeclaration";
}

function getNodeName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  return null;
}

function isTypeDeclaration(node) {
  return node && (
    node.type === "TSTypeAliasDeclaration" ||
    node.type === "TSInterfaceDeclaration"
  );
}

function isPrivatePropsParameter(param) {
  if (!param) return false;
  if (param.type === "TSParameterProperty") {
    var inner = param.parameter;
    return param.accessibility === "private" && inner && inner.type === "Identifier" && inner.name === "props";
  }
  return param.type === "Identifier" && param.name === "props" && param.accessibility === "private";
}

function getTypeLiteralNames(node) {
  var names = [];
  if (!node || node.type !== "TSLiteralType" || !node.literal) return names;
  if (node.literal.type === "Literal" && typeof node.literal.value === "string") {
    names.push(node.literal.value);
  } else if (node.literal.type === "StringLiteral" && typeof node.literal.value === "string") {
    names.push(node.literal.value);
  }
  return names;
}

function collectStringLiteralTypeNames(node) {
  if (!node) return [];
  if (node.type === "TSUnionType") {
    var out = [];
    for (var i = 0; i < node.types.length; i++) {
      out = out.concat(collectStringLiteralTypeNames(node.types[i]));
    }
    return out;
  }
  return getTypeLiteralNames(node);
}

function getCreatePropsTypeInfo(typeAnnotation) {
  if (typeAnnotation && typeAnnotation.type === "TSTypeAnnotation") {
    typeAnnotation = typeAnnotation.typeAnnotation;
  }
  if (!typeAnnotation || typeAnnotation.type !== "TSTypeReference") return null;
  if (!typeAnnotation.typeName || typeAnnotation.typeName.type !== "Identifier") return null;

  var helper = typeAnnotation.typeName.name;
  var typeParameters = typeAnnotation.typeParameters || typeAnnotation.typeArguments;
  var params = typeParameters && typeParameters.params
    ? typeParameters.params
    : [];
  if (helper !== "Omit" || params.length < 2) return null;

  var sourceType = params[0];
  if (!sourceType || sourceType.type !== "TSTypeReference" || !sourceType.typeName || sourceType.typeName.type !== "Identifier") {
    return null;
  }

  return {
    helper: helper,
    sourceType: sourceType.typeName.name,
    fields: collectStringLiteralTypeNames(params[1]),
  };
}

function getCreateGeneratedKeys(classNode) {
  var methods = classNode.body && classNode.body.body ? classNode.body.body : [];
  var createMethod = null;
  for (var i = 0; i < methods.length; i++) {
    var method = methods[i];
    if (method.type === "MethodDefinition" &&
        method.static &&
        method.key &&
        method.key.type === "Identifier" &&
        method.key.name === "create") {
      createMethod = method;
      break;
    }
  }
  if (!createMethod || !createMethod.value || !createMethod.value.body) return [];

  var generated = new Set();
  var newExpressions = findDescendants(createMethod.value.body, function (n) {
    return n.type === "NewExpression" && n.arguments && n.arguments.length > 0;
  });

  for (var n = 0; n < newExpressions.length; n++) {
    var arg = newExpressions[n].arguments[0];
    if (!arg || arg.type !== "ObjectExpression") continue;
    for (var p = 0; p < arg.properties.length; p++) {
      var prop = arg.properties[p];
      if (prop.type !== "Property") continue;
      if (prop.key.type === "Identifier") {
        generated.add(prop.key.name);
      } else if (prop.key.type === "Literal" && typeof prop.key.value === "string") {
        generated.add(prop.key.value);
      }
    }
  }

  return Array.from(generated);
}

function getParamTypeName(param) {
  if (!param || param.type !== "Identifier" || !param.typeAnnotation) return null;
  var annotation = param.typeAnnotation;
  if (annotation.type === "TSTypeAnnotation") {
    annotation = annotation.typeAnnotation;
  }
  if (!annotation || annotation.type !== "TSTypeReference" || !annotation.typeName) return null;
  return annotation.typeName.type === "Identifier" ? annotation.typeName.name : null;
}

var REQUIRED_STATIC_METHODS = ["create", "reconstitute"];
var REQUIRED_INSTANCE_METHODS = ["toSnapshot"];

var entityClassRule = {
  meta: { type: "problem", docs: { description: "Entity .entity.ts files must export a class with create, reconstitute, and toSnapshot" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!isEntityFile(filename)) return {};

    var declaredClasses = {};
    var exportedClassNames = {};
    var exportedTypeNames = [];
    var exportedTypeAliases = {};

    return {
      ClassDeclaration: function (node) {
        if (!node.id) return;
        declaredClasses[node.id.name] = node;
        if (isExported(node)) {
          exportedClassNames[node.id.name] = true;
        }
      },

      ExportNamedDeclaration: function (node) {
        if (node.declaration) {
          if (node.declaration.type === "ClassDeclaration" && node.declaration.id) {
            declaredClasses[node.declaration.id.name] = node.declaration;
            exportedClassNames[node.declaration.id.name] = true;
          }
          if (isTypeDeclaration(node.declaration) && node.declaration.id) {
            exportedTypeNames.push(node.declaration.id.name);
            if (node.declaration.type === "TSTypeAliasDeclaration") {
              exportedTypeAliases[node.declaration.id.name] = node.declaration;
            }
          }
          return;
        }
        for (var s = 0; s < node.specifiers.length; s++) {
          var specifier = node.specifiers[s];
          var localName = getNodeName(specifier.local);
          var exportedName = getNodeName(specifier.exported);
          if (node.exportKind === "type" || specifier.exportKind === "type") {
            if (exportedName) exportedTypeNames.push(exportedName);
            continue;
          }
          if (localName && declaredClasses[localName]) {
            exportedClassNames[localName] = true;
          }
        }
      },

      "Program:exit": function () {
        var exportedClasses = Object.keys(exportedClassNames).map(function (name) {
          return declaredClasses[name];
        }).filter(Boolean);

        if (exportedClasses.length === 0) {
          var typeNames = exportedTypeNames.length > 0 ? " Exports found: " + exportedTypeNames.join(", ") + "." : "";
          context.report({
            loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
            message: "Entity files must export a class with a private props constructor, static create(), static reconstitute(), and toSnapshot()." + typeNames,
          });
          return;
        }

        for (var i = 0; i < exportedClasses.length; i++) {
          var cls = exportedClasses[i];
          var body = cls.body && cls.body.body;
          if (!body) continue;

          var staticMethods = {};
          var instanceMethods = {};
          var constructorMethod = null;

          for (var j = 0; j < body.length; j++) {
            var m = body[j];
            if (m.type !== "MethodDefinition") continue;
            if (m.key.type !== "Identifier") continue;
            var name = m.key.name;
            if (name === "constructor") {
              constructorMethod = m;
              if (m.accessibility !== "private") {
                context.report({ node: m.key, message: "Entity " + cls.id.name + " constructor must be private" });
              }
              continue;
            }
            if (m.static) {
              staticMethods[name] = m;
            } else {
              instanceMethods[name] = m;
            }
          }

          if (!constructorMethod) {
            context.report({ node: cls.id, message: "Entity " + cls.id.name + " must define a private constructor(private props: XxxProps)" });
          } else {
            var params = constructorMethod.value && constructorMethod.value.params ? constructorMethod.value.params : [];
            if (params.length !== 1 || !isPrivatePropsParameter(params[0])) {
              context.report({ node: constructorMethod.key, message: "Entity " + cls.id.name + " constructor must be private constructor(private props: XxxProps)" });
            }
          }

          for (var r = 0; r < REQUIRED_STATIC_METHODS.length; r++) {
            var req = REQUIRED_STATIC_METHODS[r];
            if (!staticMethods[req]) {
              context.report({ node: cls.id, message: "Entity " + cls.id.name + " must define static " + req + "()" });
            }
          }
          for (var r2 = 0; r2 < REQUIRED_INSTANCE_METHODS.length; r2++) {
            var req2 = REQUIRED_INSTANCE_METHODS[r2];
            if (!instanceMethods[req2]) {
              context.report({ node: cls.id, message: "Entity " + cls.id.name + " must define " + req2 + "()" });
            }
          }

          var createPropsName = "Create" + cls.id.name + "Props";
          var propsName = cls.id.name + "Props";
          var createMethod = staticMethods.create;
          var createParams = createMethod && createMethod.value && createMethod.value.params ? createMethod.value.params : [];
          if (getParamTypeName(createParams[0]) !== createPropsName) {
            context.report({ node: createMethod ? createMethod.key : cls.id, message: "Entity " + cls.id.name + ".create(...) must accept input: " + createPropsName });
          }

          var createProps = exportedTypeAliases[createPropsName];
          if (!createProps) {
            context.report({ node: cls.id, message: "Entity " + cls.id.name + " must export " + createPropsName });
            continue;
          }

          var typeInfo = getCreatePropsTypeInfo(createProps.typeAnnotation);
          if (!typeInfo || typeInfo.sourceType !== propsName) {
            context.report({ node: createProps.id, message: createPropsName + " must be Omit<" + propsName + ", generated fields> so generated fields can be linted consistently" });
            continue;
          }

          var generatedKeys = getCreateGeneratedKeys(cls);
          if (generatedKeys.length === 0) continue;
          for (var go = 0; go < generatedKeys.length; go++) {
            var generatedOmitKey = generatedKeys[go];
            if (!typeInfo.fields.includes(generatedOmitKey)) {
              context.report({ node: createProps.id, message: createPropsName + " must omit generated field `" + generatedOmitKey + "`" });
            }
          }
        }
      },
    };
  },
};

// ─── Rule 12: no-raw-entity-serialization ─────────────────────────────────
var ENTITY_LIKE_NAMES = new Set([
  "resourceServer",
  "resourceServers",
]);

function isToSnapshotCall(node) {
  return node &&
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "toSnapshot";
}

function isEntityLikeExpression(node) {
  if (!node) return false;
  if (node.type === "Identifier") return ENTITY_LIKE_NAMES.has(node.name);
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return ENTITY_LIKE_NAMES.has(node.property.name);
  }
  return false;
}

var noRawEntitySerializationRule = {
  meta: { type: "problem", docs: { description: "Domain entities must be serialized through toSnapshot()" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!/\/src\/(application|http)\//.test(filename)) return {};
    return {
      CallExpression: function (node) {
        if (node.callee.type !== "MemberExpression" || node.callee.computed) return;
        if (node.callee.property.type !== "Identifier" || node.callee.property.name !== "stringify") return;
        if (node.callee.object.type !== "Identifier" || node.callee.object.name !== "JSON") return;
        var firstArg = node.arguments[0];
        if (firstArg && !isToSnapshotCall(firstArg) && isEntityLikeExpression(firstArg)) {
          context.report({ node: firstArg, message: "Serialize domain entities with entity.toSnapshot() before JSON.stringify(...)" });
        }
      },

      SpreadElement: function (node) {
        if (isEntityLikeExpression(node.argument)) {
          context.report({ node: node, message: "Spread entity.toSnapshot(), not a domain entity instance" });
        }
      },
    };
  },
};

// ─── Rule 13: crud-adapter-jsdoc ──────────────────────────────────────────
var crudAdapterJSDocRule = {
  meta: { type: "problem", docs: { description: "CrudAdapter public methods need JSDoc" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!isCrudAdapter(filename)) return {};

    var crudClass = null;

    return {
      ClassDeclaration: function (node) {
        if (node.id && node.id.name === "CrudAdapter") {
          crudClass = node;
        }
      },
      "Program:exit": function () {
        if (!crudClass) return;
        var body = crudClass.body && crudClass.body.body;
        if (!body) return;
        for (var i = 0; i < body.length; i++) {
          var member = body[i];
          if (member.type !== "MethodDefinition") continue;
          if (member.key.type === "Identifier" && member.key.name === "constructor") continue;
          if (member.accessibility === "private") continue;
          if (!hasJSDoc(context, member)) {
            context.report({ node: member.key, message: "Every public CrudAdapter method must have JSDoc" });
          }
        }
      },
    };
  },
};

// ─── Rule 14: no-magic-numbers ────────────────────────────────────────────

function isSCREAMING_SNAKE(name) {
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name);
}

function isConstDeclarator(node) {
  return node &&
    node.type === "VariableDeclarator" &&
    node.parent &&
    node.parent.type === "VariableDeclaration" &&
    node.parent.kind === "const";
}

function walkUpPastContainers(node) {
  var p = node.parent;
  while (p && (
    p.type === "UnaryExpression" ||
    p.type === "BinaryExpression" ||
    p.type === "LogicalExpression" ||
    p.type === "Property" ||
    p.type === "ObjectExpression" ||
    p.type === "ArrayExpression" ||
    p.type === "TSAsExpression" ||
    p.type === "TSSatisfiesExpression" ||
    p.type === "TSTypeAssertion"
  )) {
    p = p.parent;
  }
  return p;
}

function isAllowedConstLocation(filename) {
  return /\/src\/(shared|domain|infrastructure)\//.test(filename) || filename.includes("/packages/lib/src/");
}

var noMagicNumbersRule = {
  meta: { type: "problem", docs: { description: "No magic numbers in application, domain, HTTP, and shared layers; extract to named constants" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!/\/src\/(application|domain|http|shared)\//.test(filename)) return {};
    if (/\/tests\//.test(filename)) return {};

    return {
      Literal: function (node) {
        if (typeof node.value !== "number") return;
        if (node.value === 0 || node.value === 1) return;

        if (node.parent && node.parent.type === "Property" && node.parent.key === node) return;
        if (node.parent && node.parent.type === "TSEnumMember" && node.parent.initializer === node) return;
        if (node.parent && (node.parent.type === "TSLiteralType" || node.parent.type === "TSTypeAnnotation")) return;

        var p = walkUpPastContainers(node);

        if (isConstDeclarator(p) && p.id && p.id.type === "Identifier" && isSCREAMING_SNAKE(p.id.name)) return;

        context.report({ node: node, message: "Magic number " + node.value + ". Extract to a named constant." });
      },
    };
  },
};

// ─── Rule 15: constants-placement ─────────────────────────────────────────

var constantsPlacementRule = {
  meta: { type: "problem", docs: { description: "SCREAMING_SNAKE_CASE const declarations must live in shared, domain, or infrastructure" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!/\/src\//.test(filename)) return {};
    if (/\/tests\//.test(filename)) return {};
    if (isAllowedConstLocation(filename)) return {};

    return {
      VariableDeclarator: function (node) {
        if (!isConstDeclarator(node)) return;
        if (!node.id || node.id.type !== "Identifier") return;
        if (!isSCREAMING_SNAKE(node.id.name)) return;
        context.report({ node: node.id, message: "Constant " + node.id.name + " must live in src/shared/, src/domain/, or src/infrastructure/" });
      },
    };
  },
};

// ─── Rule 16: constants-jsdoc ─────────────────────────────────────────────

function getTopLevelStatement(declarator) {
  var p = declarator.parent;
  if (!p) return null;
  if (p.type === "ExportNamedDeclaration") return p;
  if (p.parent && p.parent.type === "ExportNamedDeclaration") return p.parent;
  return p;
}

function isConstStatement(stmt) {
  if (stmt.type === "ExportNamedDeclaration") {
    return stmt.declaration && stmt.declaration.type === "VariableDeclaration" && stmt.declaration.kind === "const";
  }
  return stmt.type === "VariableDeclaration" && stmt.kind === "const";
}

function hasImmediateJSDoc(context, stmt) {
  var comments = context.sourceCode.getCommentsBefore(stmt);
  for (var i = 0; i < comments.length; i++) {
    var comment = comments[i];
    if (comment.value.charAt(0) !== "*") continue;
    if (comment.loc && stmt.loc && comment.loc.end.line < stmt.loc.start.line - 1) continue;
    return true;
  }
  return false;
}

function areAdjacentStatements(left, right) {
  return left.loc && right.loc && left.loc.end.line + 1 === right.loc.start.line;
}

function isInDocumentedGroup(context, declarator) {
  var stmt = getTopLevelStatement(declarator);
  if (!stmt || !stmt.parent || !stmt.parent.body) return false;

  var body = stmt.parent.body;
  var idx = -1;
  for (var i = 0; i < body.length; i++) {
    if (body[i] === stmt) { idx = i; break; }
  }
  if (idx <= 0) return false;

  for (var k = idx - 1; k >= 0; k--) {
    var prev = body[k];
    if (!isConstStatement(prev)) break;
    if (!areAdjacentStatements(prev, body[k + 1])) break;
    if (hasImmediateJSDoc(context, prev)) return true;
  }

  return false;
}

function hasConstDoc(context, declarator) {
  var stmt = getTopLevelStatement(declarator);
  if (!stmt) return false;
  if (hasImmediateJSDoc(context, stmt)) return true;
  if (isInDocumentedGroup(context, declarator)) return true;
  return false;
}

var constantsJSDocRule = {
  meta: { type: "problem", docs: { description: "SCREAMING_SNAKE_CASE constants must have JSDoc (direct or group)" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!/\/src\//.test(filename)) return {};
    if (/\/tests\//.test(filename)) return {};

    return {
      VariableDeclarator: function (node) {
        if (!isConstDeclarator(node)) return;
        if (!node.id || node.id.type !== "Identifier") return;
        if (!isSCREAMING_SNAKE(node.id.name)) return;

        // Only enforce in allowed const locations (shared, domain, infrastructure)
        if (!isAllowedConstLocation(filename)) return;

        if (!hasConstDoc(context, node)) {
          context.report({ node: node.id, message: "Constant " + node.id.name + " must have JSDoc (a /** group doc */ above a block of related constants, or a /** doc */ above each constant)" });
        }
      },
    };
  },
};

// ─── Rule 17: worker-isolation ────────────────────────────────────────────
function isCoreWorker(filename) {
  return filename.includes("/workers/core/");
}

function isUiWorker(filename) {
  return filename.includes("/workers/ui/");
}

function isImportingOtherWorker(filename, spec) {
  if (!spec) return false;
  if (isCoreWorker(filename)) {
    return spec.includes("workers/ui") || spec.includes("/ui/") || spec === "@id/ui";
  }
  if (isUiWorker(filename)) {
    return spec.includes("workers/core") || spec.includes("/core/");
  }
  return false;
}

var workerIsolationRule = {
  meta: { type: "problem", docs: { description: "Workers must not import each other" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!isCoreWorker(filename) && !isUiWorker(filename)) return {};

    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (isImportingOtherWorker(filename, spec)) {
          context.report({ node: node.source, message: "Workers must not import from each other: " + spec });
        }
      },
      ExportNamedDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (isImportingOtherWorker(filename, spec)) {
          context.report({ node: node.source, message: "Workers must not re-export from each other: " + spec });
        }
      },
    };
  },
};

// ─── Rule 18: core-no-ui-deps ─────────────────────────────────────────────
var CORE_UI_DEPS = ["react", "react-dom", "vinext", "@vitejs/", "@id/ui", "react-aria-components", "lucide-react"];

function matchesPackage(spec, name) {
  return spec === name || spec.startsWith(name + "/");
}

var coreNoUiDepsRule = {
  meta: { type: "problem", docs: { description: "Core worker must not import UI dependencies" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!isCoreWorker(filename)) return {};

    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (!spec) return;
        for (var i = 0; i < CORE_UI_DEPS.length; i++) {
          var dep = CORE_UI_DEPS[i];
          if (matchesPackage(spec, dep) || spec.startsWith(dep)) {
            context.report({ node: node.source, message: "Core worker must not import UI dependency: " + spec });
            return;
          }
        }
      },
    };
  },
};

// ─── Rule 19: ui-no-auth-deps ─────────────────────────────────────────────
var UI_AUTH_DEPS = ["better-auth", "@better-auth/", "drizzle-orm", "jose"];
var UI_FORBIDDEN_BINDING_TYPES = new Set(["D1Database", "D1PreparedStatement", "D1Result", "KVNamespace"]);

var uiNoAuthDepsRule = {
  meta: { type: "problem", docs: { description: "UI worker must not import auth, persistence, or signing dependencies" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!isUiWorker(filename)) return {};

    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (!spec) return;
        for (var i = 0; i < UI_AUTH_DEPS.length; i++) {
          var dep = UI_AUTH_DEPS[i];
          if (matchesPackage(spec, dep) || spec.startsWith(dep)) {
            context.report({ node: node.source, message: "UI worker must not import auth/persistence/signing dependency: " + spec });
            return;
          }
        }
      },
      TSTypeReference: function (node) {
        var typeName = node.typeName;
        if (typeName && typeName.type === "Identifier" && UI_FORBIDDEN_BINDING_TYPES.has(typeName.name)) {
          context.report({ node: typeName, message: "UI worker must not declare D1/KV binding type: " + typeName.name });
        }
      },
    };
  },
};

// ─── Rule 20: packages-lib-isolation ──────────────────────────────────────
var packagesLibIsolationRule = {
  meta: { type: "problem", docs: { description: "packages/lib must remain framework-free" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!filename.includes("/packages/lib/src/")) return {};

    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (!spec) return;
        if (spec.startsWith("./") || spec.startsWith("../")) return;
        if (spec === "@id/lib" || spec.startsWith("@id/lib/")) return;
        if (spec === "jose") return;
        context.report({ node: node.source, message: "packages/lib may only import itself, relative files, or jose: " + spec });
      },
    };
  },
};

// ─── Rule 21: auth-boundary ───────────────────────────────────────────────
function isApprovedAuthBoundaryFile(filename) {
  if (filename.includes("/workers/core/src/auth/")) return true;
  if (endsWithSegment(filename, "workers/core/src/main.ts")) return true;
  if (filename.includes("/workers/core/tests/")) return true;
  return false;
}

function endsWithSegment(filename, segment) {
  return filename === segment || filename.endsWith("/" + segment);
}

function isBetterAuthImport(spec) {
  return spec === "better-auth" || spec.startsWith("better-auth/") || spec === "@better-auth/oauth-provider" || spec.startsWith("@better-auth/");
}

var authBoundaryRule = {
  meta: { type: "problem", docs: { description: "Better Auth imports stay inside approved auth boundary files" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (isUiWorker(filename)) return {};
    if (isApprovedAuthBoundaryFile(filename)) return {};

    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (spec && isBetterAuthImport(spec)) {
          context.report({ node: node.source, message: "Better Auth imports are only allowed in workers/core/src/auth, core main mounting, or tests: " + spec });
        }
      },
    };
  },
};

// ─── Rule 23: ui-route-composition ────────────────────────────────────────
var FORBIDDEN_HTML_TAGS = new Set([
  "div", "main", "section", "header", "footer", "aside", "nav",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span",
]);

var FORBIDDEN_DAISY_CLASSES = /\b(btn|navbar|drawer|menu|card|dock|input|select|textarea|badge|alert|modal|dropdown|collapse|carousel|tabs|table|steps|timeline|hero|chat|mockup|stat|diff|join|mask|filter|indicator|stack|divider|skeleton|swap|checkbox|radio|range|rating|toggle|kbd|label|file|form-control|loading|avatar|tooltip|link|breadcrumbs|bottom-nav)\b/;

var FORBIDDEN_TAILWIND_UTILITIES = /\b(flex|grid|gap-|p-\d|pt-|pb-|pl-|pr-|px-|py-|m-\d|mt-|mb-|ml-|mr-|mx-|my-|text-|bg-|border-|rounded-|w-\d|h-\d|min-h-|max-w-|justify-|items-|self-|place-|order-|z-\d|shadow-|opacity-|scale-|rotate-|translate-|skew-|transition-|duration-|ease-|delay-|animate-)\b/;

function isAdminRouteFile(filename) {
  return /workers\/ui\/src\/app\/admin\/.*\.tsx$/.test(filename);
}

var uiRouteCompositionRule = {
  meta: { type: "problem", docs: { description: "Admin route files must compose packages/ui components, not raw HTML/Tailwind/DaisyUI classes" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!isAdminRouteFile(filename)) return {};

    return {
      JSXOpeningElement: function (node) {
        if (node.name.type === "JSXIdentifier") {
          var tagName = node.name.name;
          if (FORBIDDEN_HTML_TAGS.has(tagName)) {
            context.report({
              node: node,
              message: "Forbidden HTML tag <" + tagName + "> in admin route file. Use packages/ui layout components (Page, PageHeader, PageBody, Stack, Panel) instead.",
            });
          }
        }
        // Check className attributes for raw Tailwind/DaisyUI
        node.attributes.forEach(function (attr) {
          if (attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier" && attr.name.name === "className") {
            if (attr.value) {
              var classNameValue = null;
              if (attr.value.type === "Literal") {
                classNameValue = attr.value.value;
              } else if (attr.value.type === "JSXExpressionContainer" && attr.value.expression.type === "Literal") {
                classNameValue = attr.value.expression.value;
              }
              if (classNameValue && typeof classNameValue === "string") {
                if (FORBIDDEN_DAISY_CLASSES.test(classNameValue)) {
                  context.report({
                    node: attr,
                    message: "Forbidden DaisyUI class in admin route file className. Use token props on packages/ui components instead.",
                  });
                }
                if (FORBIDDEN_TAILWIND_UTILITIES.test(classNameValue)) {
                  context.report({
                    node: attr,
                    message: "Forbidden Tailwind utility class in admin route file className. Use token props on packages/ui components instead.",
                  });
                }
              }
            }
          }
        });
      },
      CallExpression: function (node) {
        if (node.callee.type === "Identifier" && node.callee.name === "fetch") {
          context.report({
            node: node,
            message: "Direct fetch() in admin route file. Use packages/lib API client for core-id communication.",
          });
        }
      },
    };
  },
};

// ─── Rule 24: no-direct-db-access ─────────────────────────────────────────
var DB_METHODS = new Set(["prepare", "batch", "exec"]);

function isApprovedDbAccessFile(filename) {
  if (filename.includes("/workers/core/src/infrastructure/")) return true;
  if (filename.endsWith("workers/core/src/auth/cli.ts")) return true;
  if (filename.endsWith("workers/core/src/auth/plugins/resource-server/audiences.ts")) return true;
  if (filename.endsWith("workers/core/src/auth/plugins/oauth-scope-catalog/scopes.ts")) return true;
  if (filename.endsWith("workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts")) return true;
  if (filename.endsWith("workers/core/src/auth/plugins/oauth-scope-catalog/authorization-context.ts")) return true;
  if (filename.includes("/workers/core/tests/")) return true;
  return false;
}

var noDirectDbAccessRule = {
  meta: { type: "problem", docs: { description: "Raw D1 database access is forbidden outside approved persistence boundaries; use Better Auth adapter APIs instead" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!filename.includes("/workers/core/src/")) return {};
    if (isApprovedDbAccessFile(filename)) return {};

    return {
      CallExpression: function (node) {
        if (node.callee.type !== "MemberExpression" || node.callee.computed) return;
        var method = getPropertyName(node.callee.property);
        if (!DB_METHODS.has(method)) return;

        var object = node.callee.object;
        var isEnvDb = object.type === "MemberExpression" && !object.computed &&
          getPropertyName(object.property) === "DB";
        var isEnvDbViaC = isEnvDb && object.object.type === "MemberExpression" && !object.object.computed &&
          object.object.object.type === "Identifier" && object.object.object.name === "c" &&
          getPropertyName(object.object.property) === "env";

        if (isEnvDb || isEnvDbViaC) {
          context.report({ node: node, message: "Direct " + method + "() on env.DB is forbidden outside infrastructure, auth/cli.ts, or approved plugin-owned runtime preload companions. Use Better Auth adapter APIs for plugin CRUD." });
          return;
        }

        var isIdentifier = object.type === "Identifier";
        if (isIdentifier) {
          context.report({ node: node, message: "Direct " + method + "() on a database handle is forbidden outside infrastructure, auth/cli.ts, or approved plugin-owned runtime preload companions. Use Better Auth adapter APIs for plugin CRUD." });
        }
      },
    };
  },
};

// ─── Rule 25: plugin-owned-table-boundary ─────────────────────────────────
var PLUGIN_MODEL_CONSTANTS = new Set([
  "RESOURCE_SERVER_MODEL",
  "OAUTH_RESOURCE_SCOPE_MODEL",
  "OAUTH_CLIENT_ORGANIZATION_GRANT_MODEL",
]);

var pluginOwnedTableBoundaryRule = {
  meta: { type: "problem", docs: { description: "Better Auth plugin-owned table constants must not be used from generic infrastructure persistence" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!filename.includes("/workers/core/src/infrastructure/persistence/")) return {};

    return {
      ImportDeclaration: function (node) {
        var spec = extractImportSource(node);
        if (!spec || !spec.endsWith("/shared/constants")) return;
        var names = getImportedNames(node);
        for (var i = 0; i < names.length; i++) {
          if (PLUGIN_MODEL_CONSTANTS.has(names[i])) {
            context.report({
              node: node.source,
              message: "Plugin-owned table model `" + names[i] + "` must not be used from infrastructure/persistence. Keep plugin table runtime access inside workers/core/src/auth/plugins/<plugin>/.",
            });
          }
        }
      },
    };
  },
};

// ─── Rule 26: auth-test-contract-fixtures ─────────────────────────────────
var authTestContractFixturesRule = {
  meta: { type: "problem", docs: { description: "Test-only auth route contracts must not live in production auth source" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";

    return {
      Program: function (node) {
        if (filename.endsWith("/workers/core/src/auth/contracts.ts")) {
          context.report({
            node: node,
            message: "Auth route contract fixtures are test-only. Put them under workers/core/tests/auth/fixtures/, not production auth source.",
          });
        }
      },
      ImportDeclaration: function (node) {
        if (filename.includes("/workers/core/tests/")) return;
        var spec = extractImportSource(node);
        if (spec && spec.includes("/auth/contracts")) {
          context.report({
            node: node.source,
            message: "Production source must not import test-only auth route contracts.",
          });
        }
      },
    };
  },
};

// ─── Rule 27: hono-admin-route-allowlist ──────────────────────────────────
var HONO_ADMIN_ROUTE_ALLOWLIST = new Set(["/api/admin/dashboard"]);

var honoAdminRouteAllowlistRule = {
  meta: { type: "problem", docs: { description: "Hono /api/admin routes are reserved for allowlisted aggregate workflows; plugin CRUD belongs in Better Auth plugins" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    if (!filename.includes("/workers/core/src/http/routes/")) return {};

    return {
      CallExpression: function (node) {
        var info = extractRoutePathFromAppCall(node);
        if (!info) return;
        if (!info.path.startsWith("/api/admin/")) return;
        if (HONO_ADMIN_ROUTE_ALLOWLIST.has(info.path)) return;

        context.report({
          node: info.node,
          message: "Hono /api/admin/* routes are reserved for allowlisted aggregate workflows. Put auth-owned CRUD under a Better Auth plugin endpoint mounted at /api/auth/admin/*.",
        });
      },
    };
  },
};

// ─── Rule 28: auth-plugin-folder-shape ────────────────────────────────────
function getAuthPluginIndexDir(filename) {
  var marker = "/workers/core/src/auth/plugins/";
  var index = filename.indexOf(marker);
  if (index === -1) return null;
  if (!filename.endsWith("/index.ts")) return null;
  var after = filename.slice(index + marker.length);
  if (after.split("/").length !== 2) return null;
  return filename.slice(0, filename.length - "/index.ts".length);
}

var authPluginFolderShapeRule = {
  meta: { type: "problem", docs: { description: "Custom Better Auth plugin folders must include the standard implementation files" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    var dir = getAuthPluginIndexDir(filename);
    if (!dir) return {};

    return {
      Program: function (node) {
        var requiredFiles = ["schema.ts", "operations.ts", "types.ts", "README.md"];
        for (var i = 0; i < requiredFiles.length; i++) {
          var requiredFile = requiredFiles[i];
          if (!existsSync(dir + "/" + requiredFile)) {
            context.report({
              node: node,
              message: "Custom Better Auth plugin folders must include " + requiredFile + " next to index.ts.",
            });
          }
        }
      },
    };
  },
};

// ─── Rule 29: route-path-contract ─────────────────────────────────────────
var CORE_FORBIDDEN_PATH_PREFIXES = ["/admin/", "/login", "/consent"];
var CORE_ALLOWED_PATH_PREFIX = "/api/admin/";
var UI_FORBIDDEN_PATH_PREFIX = "/api/";
var UI_APP_ROOT = "/workers/ui/src/app/";
var UI_ALLOWED_APP_ROUTE_PREFIXES = ["admin/", "login/", "consent/", "select-authorization-context/"];
var UI_ROOT_ALLOWED_FILES = new Set(["layout.tsx", "globals.css"]);
var UI_ROUTE_OWNERSHIP_FILES = new Set(["page.tsx", "route.ts", "layout.tsx"]);

function extractRoutePathFromAppCall(node) {
  if (node.type !== "CallExpression") return null;
  var callee = node.callee;
  if (callee.type !== "MemberExpression" || callee.computed) return null;
  if (callee.object.type !== "Identifier" || callee.object.name !== "app") return null;
  var method = getPropertyName(callee.property);
  if (!ROUTE_METHODS.has(method) && method !== "all" && method !== "on") return null;
  var pathArg = node.arguments[method === "on" ? 1 : 0];
  if (!pathArg || pathArg.type !== "Literal" || typeof pathArg.value !== "string") return null;
  return { method: method, path: pathArg.value, node: pathArg };
}

var routePathContractRule = {
  meta: { type: "problem", docs: { description: "Route handlers must not serve paths owned by the other worker" } },
  create: function (context) {
    var filename = context.filename || context.physicalFilename || "";
    var isCore = filename.includes("/workers/core/src/");
    var isUi = filename.includes("/workers/ui/src/");
    if (!isCore && !isUi) return {};

    return {
      Program: function (node) {
        if (!isUi) return;
        var appIndex = filename.indexOf(UI_APP_ROOT);
        if (appIndex === -1) return;

        var appPath = filename.slice(appIndex + UI_APP_ROOT.length);
        if (UI_ROOT_ALLOWED_FILES.has(appPath)) return;
        if (UI_ALLOWED_APP_ROUTE_PREFIXES.some(function (p) { return appPath.startsWith(p); })) return;

        var basename = appPath.split("/").pop();
        if (!UI_ROUTE_OWNERSHIP_FILES.has(basename)) return;

        context.report({
          node: node,
          message: "ui-id may only define public App Router routes under workers/ui/src/app/{admin,login,consent,select-authorization-context}/**. Core owns /api/* and root health/auth routes; keep UI-owned routes under /login, /consent, /select-authorization-context, or /admin/*.",
        });
      },
      CallExpression: function (node) {
        var info = extractRoutePathFromAppCall(node);
        if (!info) return;

        if (isCore) {
          var forbidden = CORE_FORBIDDEN_PATH_PREFIXES.some(function (p) { return info.path.startsWith(p); });
          if (forbidden && !info.path.startsWith(CORE_ALLOWED_PATH_PREFIX)) {
            context.report({ node: info.node, message: "core-id must not serve /login, /consent, or /admin/* paths. Auth pages belong to ui-id. Better Auth plugin admin endpoints mount under /api/auth/admin/*." });
          }
        }

        if (isUi) {
          if (info.path.startsWith(UI_FORBIDDEN_PATH_PREFIX)) {
            context.report({ node: info.node, message: "ui-id must not serve /api/* paths. Auth, OAuth, and admin API endpoints belong to core-id. UI-owned BFF endpoints must live under /admin/api/*." });
          }
        }
      },
    };
  },
};

// ─── Plugin ───────────────────────────────────────────────────────────────
var plugin = {
  meta: { name: "architecture" },
  rules: {
    "layer-imports": layerImportsRule,
    "no-mapper-imports-outside-infra": noMapperImportsOutsideInfraRule,
    "no-storage-error-parsing": noStorageErrorParsingRule,
    "no-custom-errors-outside-shared": noCustomErrorsOutsideSharedRule,
    "route-handler-boundary": routeHandlerBoundaryRule,
    "repository-workflow": repositoryWorkflowRule,
    "mapper-file": mapperFileRule,
    "entity-class": entityClassRule,
    "no-raw-entity-serialization": noRawEntitySerializationRule,
    "crud-adapter-jsdoc": crudAdapterJSDocRule,
    "no-magic-numbers": noMagicNumbersRule,
    "constants-placement": constantsPlacementRule,
    "constants-jsdoc": constantsJSDocRule,
    "worker-isolation": workerIsolationRule,
    "core-no-ui-deps": coreNoUiDepsRule,
    "ui-no-auth-deps": uiNoAuthDepsRule,
    "packages-lib-isolation": packagesLibIsolationRule,
    "auth-boundary": authBoundaryRule,
    "ui-route-composition": uiRouteCompositionRule,
    "no-direct-db-access": noDirectDbAccessRule,
    "plugin-owned-table-boundary": pluginOwnedTableBoundaryRule,
    "auth-test-contract-fixtures": authTestContractFixturesRule,
    "hono-admin-route-allowlist": honoAdminRouteAllowlistRule,
    "auth-plugin-folder-shape": authPluginFolderShapeRule,
    "route-path-contract": routePathContractRule,
  },
};

export default plugin;
