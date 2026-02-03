(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // ../butler/butler/public/js/utilities/filters.js
  var require_filters = __commonJS({
    "../butler/butler/public/js/utilities/filters.js"() {
      frappe.provide("butler.filters");
      butler.filters = {
        non_stock_item_filter: function(frm, field) {
          frm.set_query(field, function() {
            return {
              filters: {
                disabled: 0,
                is_stock_item: 0
              }
            };
          });
        }
      };
    }
  });

  // ../butler/butler/public/js/utilities/queries.js
  var require_queries = __commonJS({
    "../butler/butler/public/js/utilities/queries.js"() {
      frappe.provide("butler.queries");
      butler.queries = {
        get_item_name: function(frm, item, field) {
          return frappe.call({
            method: "butler.utils.queries.get_item_name",
            args: {
              item
            },
            callback: function(r) {
              if (r.message) {
                frm.set_value(field, r.message);
              }
            }
          });
        }
      };
    }
  });

  // ../butler/butler/public/js/utilities/utils.js
  var require_utils = __commonJS({
    "../butler/butler/public/js/utilities/utils.js"() {
      frappe.provide("butler.utils");
      butler.utils = {};
    }
  });

  // ../butler/butler/public/js/butler.bundle.js
  var require_butler_bundle = __commonJS({
    "../butler/butler/public/js/butler.bundle.js"() {
      var import_filters = __toESM(require_filters());
      var import_queries = __toESM(require_queries());
      var import_utils = __toESM(require_utils());
    }
  });
  require_butler_bundle();
})();
//# sourceMappingURL=butler.bundle.YKSZL64Q.js.map
