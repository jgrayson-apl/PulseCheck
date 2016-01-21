/*global define,document */
/*jslint sloppy:true,nomen:true */
/*
 | Copyright 2014 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/_base/array",
  "dojo/cookie",
  "dojo/date/locale",
  "dojo/number",
  "dojo/json",
  "dojo/Deferred",
  "dojo/aspect",
  "dojo/on",
  "dojo/dom",
  "dojo/dom-class",
  "put-selector/put",
  "esri/arcgis/utils",
  "esri/arcgis/Portal",
  "esri/request",
  "dojo/store/Memory",
  "dojo/store/Observable",
  "dgrid/OnDemandList",
  "dgrid/OnDemandGrid",
  "dgrid/Selection",
  "dgrid/extensions/DijitRegistry",
  "dijit/registry",
  "dijit/Dialog"
], function (declare, lang, array, cookie, locale, number, json, Deferred, aspect, on, dom, domClass, put,
             arcgisUtils, arcgisPortal, esriRequest,
             Memory, Observable, OnDemandList, OnDemandGrid, Selection, DijitRegistry,
             registry, Dialog) {

  /**
   * MAIN APPLICATION
   */
  var MainApp = declare(null, {

    /**
     * EMPTY STATUS TOTALS
     */
    emptyStatusTotals: [
      {
        id: "detailsPageOk",
        label: "Details Page",
        nodeId: "detailsPage-info-node",
        Checking: 0,
        Ok: 0,
        Error: 0,
        Unknown: 0
      },
      {
        id: "webAppOk",
        label: "Web App",
        nodeId: "webApp-info-node",
        Checking: 0,
        Ok: 0,
        Error: 0,
        Unknown: 0
      },
      {
        id: "webMapOk",
        label: "Web Map",
        nodeId: "webMap-info-node",
        Checking: 0,
        Ok: 0,
        Error: 0,
        Unknown: 0
      },
      {
        id: "serviceOk",
        label: "Service",
        nodeId: "service-info-node",
        Checking: 0,
        Ok: 0,
        Error: 0,
        Unknown: 0
      }
    ],

    /**
     * ITEM STATUS
     */
    ITEM_STATUS: {
      UNKNOWN: "Unknown",
      CHECKING: "Checking",
      OK: "Ok",
      ERROR: "Error"
    },

    /**
     * PAGE TYPE
     */
    PAGE_TYPE: {
      PUBLIC_DETAILS: 1,
      USER_DETAILS: 2,
      PUBLIC_WEBMAP: 3,
      USER_WEBMAP: 4,
      PUBLIC_GROUP: 5,
      USER_GROUP: 6
    },

    /**
     * CONSTRUCTOR
     *
     * @param config
     */
    constructor: function (config) {
      declare.safeMixin(this, config);

      // STATUS CHECKERS //
      this.statusHandles = [];
    },

    /**
     *
     * @param group
     * @returns {Date|null}
     * @private
     */
    _getLastGroupCheck: function (group) {
      var groupCookie = cookie(group.id);
      return groupCookie ? new Date(groupCookie) : null;
    },

    /**
     *
     * @param group
     * @param lastChecked
     * @private
     */
    _setLastGroupCheck: function (group, lastChecked) {
      group.lastChecked = lastChecked;
      this.groupsStore.put(group);
      cookie(group.id, group.lastChecked, {expires: lastChecked ? 7 : -1});
    },

    /**
     * STARTUP
     */
    startup: function () {

      // INIT STATUS INFOS //
      this.initStatusInfos();

      // PORTAL //
      this.portal = new arcgisPortal.Portal(this.sharinghost);
      this.portal.on("load", lang.hitch(this, function () {

        // SIGN IN //
        this.portal.signIn().then(lang.hitch(this, function (loggedInUser) {
          // SET PORTAL USER //
          this.portalUser = loggedInUser;

          // DISPLAY USER INFO //
          this.updateUserInfo(this.portalUser);
          // GET USER GROUPS //
          this.updateUserGroups(this.portalUser);

          // CLEAR DISPLAY MESSAGE //
          MainApp.displayMessage();
        }), MainApp.displayMessage);
      }));

    },

    /**
     *
     * @param loggedInUser
     */
    updateUserInfo: function (loggedInUser) {
      var portalUserNode = dom.byId("portaluser-section");
      if(loggedInUser) {
        put(portalUserNode, "tr td $ <td img.user-thumb", loggedInUser.fullName, {src: loggedInUser.thumbnailUrl});
      } else {
        portalUserNode.innerHTML = "";
      }
    },

    /**
     *
     */
    clearLastChecks: function () {
      if(this.groupsStore) {

        array.forEach(this.groupsStore.query(), lang.hitch(this, function (group) {
          if(group.lastChecked) {
            this._setLastGroupCheck(group, null);
          }
        }));

        this.groupsList.clearSelection();
        this.initStatusInfos();
        this.itemsList.set("noDataMessage", "No Items");
        this.itemsList.set("store", null);
      }
    },

    /**
     *
     * @param loggedInUser
     */
    updateUserGroups: function (loggedInUser) {

      // INIT GROUP ITEMS LIST //
      this.initGroupItemsList();

      var groupListNode = dom.byId("group-list-node");

      if(loggedInUser) {
        loggedInUser.getGroups().then(lang.hitch(this, function (groups) {

          // GET GROUP LAST CHECKED //
          array.forEach(groups, lang.hitch(this, function (group) {
            group.lastChecked = this._getLastGroupCheck(group);
          }));

          // GROUP STORE //
          this.groupsStore = new Observable(new Memory({data: groups}));

          // GROUP LIST //
          this.groupsList = new (declare([OnDemandList, Selection, DijitRegistry]))({
            store: this.groupsStore,
            sort: [{attribute: "created", descending: true}],
            deselectOnRefresh: false,
            selectionMode: "single",
            renderRow: lang.hitch(this, function (group, options) {

              var groupNode = put("table.group-node", {width: "100%", border: 0});
              var topRow = put(groupNode, "tr");

              var thumbCell = put(topRow, "td.group-thumb", {rowSpan: 3});
              put(thumbCell, "img.group-thumb", {src: group.thumbnailUrl || "./images/error_gray.png"});

              var titleCell = put(topRow, "td", {colSpan: 2});
              put(titleCell, "div.group-title a", {innerHTML: group.title, href: this._getPortalPageUrl(group, this.PAGE_TYPE.USER_GROUP), target: "_blank"});

              var nextRow = put(groupNode, "tr");
              put(nextRow, "td.group-access-cell span.group-access.access.$ $ << td.group-owner-cell span.group-owner $", lang.replace("access-{access}", group), group.access, group.owner);

              if(group.lastChecked) {
                var lastCheckedLabel = locale.format(group.lastChecked, {formatLength: "medium"});
                var bottomRow = put(groupNode, "tr");
                put(bottomRow, "td.group-lastChecked-cell div.group-lastChecked $ <", lang.replace("Last Checked: {0}", [lastCheckedLabel]), {colSpan: 3});
              }

              return groupNode;
            })
          }, groupListNode);
          this.groupsList.startup();

          // GROUP SELECTED //
          this.groupsList.on("dgrid-select", lang.hitch(this, function (evt) {
            var selectedGroup = evt.rows[0].data;
            this.updateGroupItems(selectedGroup);
          }));


          registry.byId("sort-select").on("change", lang.hitch(this, function (sortMethod) {
            var sortAscending = registry.byId("sort-direction").get("checked");
            this.groupsList.set("sort", [{attribute: sortMethod, descending: !sortAscending}]);
          }));

          registry.byId("sort-direction").on("change", lang.hitch(this, function (sortAscending) {
            var sortMethod = registry.byId("sort-select").get("value");
            this.groupsList.set("sort", [{attribute: sortMethod, descending: !sortAscending}]);
          }));

          // CLEAR LAST CHECKED STATUS //
          registry.byId("clear-last-checked-btn").on("click", lang.hitch(this, function () {
            if(confirm("Clear all group 'last checked' status?")) {
              this.clearLastChecks();
            }
          }));

        }));
      } else {
        groupListNode.innerHTML = "";
      }

    },

    /**
     *
     */
    initGroupItemsList: function () {
      var itemsListNode = dom.byId("items-list-node");

      this.itemsStore = new Observable(new Memory({data: []}));

      this.itemsList = new (declare([OnDemandGrid, DijitRegistry]))({
        store: this.itemsStore,
        bufferRows: 300, //Infinity,
        sort: [{attribute: "title", descending: false}],
        noDataMessage: "No Items",
        columns: [
          {
            label: "Title",
            field: "title"
          },
          {
            label: "ID",
            field: "id",
            renderCell: lang.hitch(this, function (item, value, node, options) {
              var publicItemDetailsPageUrl = this._getPortalPageUrl(item, this.PAGE_TYPE.PUBLIC_DETAILS);
              var userItemDetailsPageUrl = this._getPortalPageUrl(item, this.PAGE_TYPE.USER_DETAILS);

              var idNode = put("div");
              put(idNode, "div", value);
              put(idNode, "span a.item-link", {innerHTML: "public", href: publicItemDetailsPageUrl, target: "_blank"});
              put(idNode, "span", " | ");
              put(idNode, "span a.item-link", {innerHTML: this.portalUser.username, href: userItemDetailsPageUrl, target: "_blank"});
              return idNode;
            })
          },
          {
            label: "Owner",
            field: "owner"
          },
          {
            label: "Type",
            field: "type"
          },
          {
            label: "Access",
            field: "access",
            renderCell: lang.hitch(this, function (item, value, node, options) {
              return put(lang.replace("div.access.access-{access}", item), item.access);
            })
          },
          {
            label: "Details Page",
            field: "detailsPageOk",
            renderCell: lang.hitch(this, function (item, value, node, options) {

              if(item.access === "public") {
                if(!item.hasOwnProperty("detailsPageOk")) {
                  item.detailsPageOk = this.ITEM_STATUS.CHECKING;
                  setTimeout(lang.hitch(this, function () {
                    this.checkPublicItemDetailsPageStatus(item);
                  }), 0);
                }
              } else {
                item.detailsPageOk = this.ITEM_STATUS.UNKNOWN;
              }
              return put(lang.replace("div.status.status{detailsPageOk}", item));
            })
          },
          {
            label: "Web App",
            field: "webAppOk",
            renderCell: lang.hitch(this, function (item, value, node, options) {

              if(item.type === "Web Mapping Application") {
                if(!item.hasOwnProperty("webAppOk")) {
                  item.webAppOk = this.ITEM_STATUS.CHECKING;
                  setTimeout(lang.hitch(this, function () {
                    this.checkWebAppPageStatus(item);
                  }), 0);
                }
              } else {
                item.webAppOk = this.ITEM_STATUS.UNKNOWN;
              }
              return put(lang.replace("div.status.status{webAppOk}", item));
            })
          },
          {
            label: "Web Map",
            field: "webMapOk",
            renderCell: lang.hitch(this, function (item, value, node, options) {

              if(item.type === "Web Map") {
                if(!item.hasOwnProperty("webMapOk")) {
                  item.webMapOk = this.ITEM_STATUS.CHECKING;
                  setTimeout(lang.hitch(this, function () {
                    this.checkWebMapStatus(item);
                  }), 0);
                }
              } else {
                item.webMapOk = this.ITEM_STATUS.UNKNOWN;
              }
              return put(lang.replace("div.status.status{webMapOk}", item));
            })
          },
          {
            label: "Service",
            field: "serviceOk",
            renderCell: lang.hitch(this, function (item, value, node, options) {

              if(array.indexOf(item.typeKeywords, "Service") > -1) {
                var requiresSubscription = (array.indexOf(item.typeKeywords, "Requires Subscription") > -1);
                var requiresCredits = (array.indexOf(item.typeKeywords, "Requires Credits") > -1);
                if(requiresSubscription || requiresCredits) {
                  item.serviceOk = this.ITEM_STATUS.ERROR;
                  item.serviceOkError = {error: "This item requires a Subscription or Credits."};
                  item.hasError = true;
                } else {
                  if(!item.hasOwnProperty("serviceOk")) {
                    item.serviceOk = this.ITEM_STATUS.CHECKING;
                    setTimeout(lang.hitch(this, function () {
                      this.checkServiceStatus(item);
                    }), 0);
                  }
                }
              } else {
                item.serviceOk = this.ITEM_STATUS.UNKNOWN;
              }
              return put(lang.replace("div.status.status{serviceOk}", item));
            })
          },
          {
            label: "Error",
            field: "hasError",
            /*get: function (item) {
             return item.hasError || false;
             },*/
            renderCell: lang.hitch(this, function (item, value, node, options) {
              var hasErrorNode = put("div");
              if(item.hasError) {
                var displayErrorsNode = put(hasErrorNode, "div.hasError", {innerHTML: "error"});
                on(displayErrorsNode, "click", lang.hitch(this, this._displayAllErrors, item));
                var recheckNode = put(hasErrorNode, "div.recheck", {innerHTML: "recheck"});
                on(recheckNode, "click", lang.hitch(this, this.recheckItem, item));
              }
              return hasErrorNode;
            })
          }
        ]
      }, itemsListNode);
      this.itemsList.startup();

      // CELL CLICK //
      this.itemsList.on(".dgrid-cell:click", lang.hitch(this, function (evt) {
        var cell = this.itemsList.cell(evt);
        var field = cell.column.field;
        var item = cell.row.data;

        switch (field) {
          case "detailsPageOk":
            if(item[field] == this.ITEM_STATUS.ERROR) {
              window.open(this._getPortalPageUrl(item, this.PAGE_TYPE.PUBLIC_DETAILS));
            }
            break;
          case "webAppOk":
            if(item[field] == this.ITEM_STATUS.ERROR) {
              window.open(item.url);
            }
            break;
          case "webMapOk":
            if(item[field] == this.ITEM_STATUS.ERROR) {
              window.open(this._getPortalPageUrl(item, this.PAGE_TYPE.USER_WEBMAP));
            }
            break;
          case "serviceOk":
            if(item[field] == this.ITEM_STATUS.ERROR) {
              window.open(item.url);
            }
            break;
        }
      }));

    },

    /**
     *
     * @param item
     */
    recheckItem: function (item) {
      if(item) {
        delete item.hasError;
        delete item.detailsPageOk;
        delete item.detailsPageOkError;
        delete item.webAppOk;
        delete item.webAppOkError;
        delete item.webMapOk;
        delete item.webMapOkError;
        delete item.serviceOk;
        delete item.serviceOkError;

        this.itemsStore.put(item);
      } else {
        console.warn("recheckItem: missing item parameter");
      }
    },

    /**
     *
     * @param item
     * @private
     */
    _displayAllErrors: function (item) {
      if(item) {
        if(item.hasError) {
          var allErrorDetails = {};
          if(item.detailsPageOk === this.ITEM_STATUS.ERROR) {
            allErrorDetails.detailsPage = item.detailsPageOkError;
          }
          if(item.webAppOk === this.ITEM_STATUS.ERROR) {
            allErrorDetails.webApp = item.webAppOkError;
          }
          if(item.webMapOk === this.ITEM_STATUS.ERROR) {
            allErrorDetails.webMap = item.webMapOkError;
          }
          if(item.serviceOk === this.ITEM_STATUS.ERROR) {
            allErrorDetails.service = item.serviceOkError;
          }
          this._displayErrorDetails(allErrorDetails);
        }
      } else {
        console.warn("_displayAllErrors: missing item parameter");
      }
    },

    /**
     *
     * @param errorDetails
     * @private
     */
    _displayErrorDetails: function (errorDetails) {

      // CONVERT ERROR TO STRING //
      var itemCache = [];
      var errorMessage = json.stringify(errorDetails, function (key, value) {
        // AVOID CYCLIC REFERENCES //
        if(typeof value === 'object' && value !== null) {
          if(itemCache.indexOf(value) !== -1) {
            return;
          }
          itemCache.push(value);
        }
        return value;
      }, "  ");

      var tooltipContent = "<div class='error-node'><pre>" + errorMessage + "</pre></div>";

      var errorDialog = new Dialog({
        title: "Error Details",
        content: put("div", {innerHTML: tooltipContent})
      });
      errorDialog.show();

    },

    /**
     *
     * @param itemOrGroup
     * @param type
     * @returns {*}
     * @private
     */
    _getPortalPageUrl: function (itemOrGroup, type) {

      var itemInfo = {
        id: itemOrGroup.id,
        protocol: location.protocol,
        urlKey: this.portalUser.portal.urlKey,
        customBaseUrl: this.portalUser.portal.customBaseUrl
      };

      var urlTemplate = "{protocol}//www.arcgis.com/";

      switch (type) {
        case this.PAGE_TYPE.PUBLIC_DETAILS:
          urlTemplate = "{protocol}//www.arcgis.com/home/item.html?id={id}";
          break;
        case this.PAGE_TYPE.USER_DETAILS:
          urlTemplate = "{protocol}//{urlKey}.{customBaseUrl}/home/item.html?id={id}";
          break;
        case this.PAGE_TYPE.PUBLIC_WEBMAP:
          urlTemplate = "{protocol}//www.arcgis.com/home/webmap/viewer.html?webmap={id}";
          break;
        case this.PAGE_TYPE.USER_WEBMAP:
          urlTemplate = "{protocol}//{urlKey}.{customBaseUrl}/home/webmap/viewer.html?webmap={id}";
          break;
        case this.PAGE_TYPE.PUBLIC_GROUP:
          urlTemplate = "{protocol}//www.arcgis.com/home/group.html?id={id}";
          break;
        case this.PAGE_TYPE.USER_GROUP:
          urlTemplate = "{protocol}//{urlKey}.{customBaseUrl}/home/group.html?id={id}";
          break;
      }

      return lang.replace(urlTemplate, itemInfo);
    },

    /**
     *
     * @param item
     */
    checkPublicItemDetailsPageStatus: function (item) {

      var statusHandle = esriRequest({
        url: this._getPortalPageUrl(item, this.PAGE_TYPE.PUBLIC_DETAILS),
        handleAs: "xml"
      }, {
        useProxy: true
      }).then(lang.hitch(this, function () {
        item.detailsPageOk = this.ITEM_STATUS.OK;
        this.itemsStore.put(item);
      }), lang.hitch(this, function (error) {
        item.detailsPageOkError = error;
        item.detailsPageOk = this.ITEM_STATUS.ERROR;
        item.hasError = true;
        this.itemsStore.put(item);
      }));

      this.statusHandles.push(statusHandle);
    },

    /**
     *
     * @param item
     */
    checkWebAppPageStatus: function (item) {

      var statusHandle = esriRequest({
        url: item.url,
        handleAs: "xml"
      }, {
        useProxy: true
      }).then(lang.hitch(this, function () {
        item.webAppOk = this.ITEM_STATUS.OK;
        this.itemsStore.put(item);
      }), lang.hitch(this, function (error) {
        item.webAppOkError = error;
        item.webAppOk = this.ITEM_STATUS.ERROR;
        item.hasError = true;
        this.itemsStore.put(item);
      }));

      this.statusHandles.push(statusHandle);
    },

    /**
     *
     * @param item
     */
    checkWebMapStatus: function (item) {

      var statusHandle = arcgisUtils.createMap(item.id, put("div")).then(lang.hitch(this, function (createMapResponse) {

        if(createMapResponse.errors && (createMapResponse.errors.length > 0)) {
          item.webMapOkError = createMapResponse.errors;
          item.webMapOk = this.ITEM_STATUS.ERROR;
          item.hasError = true;
        } else {
          item.webMapOk = this.ITEM_STATUS.OK;
        }
        this.itemsStore.put(item);

      }), lang.hitch(this, function (error) {
        item.webMapOkError = error;
        item.webMapOk = this.ITEM_STATUS.ERROR;
        item.hasError = true;
        this.itemsStore.put(item);
      }));

      this.statusHandles.push(statusHandle);
    },

    /**
     *
     * @param item
     */
    checkServiceStatus: function (item) {

      var statusHandle = esriRequest({
        url: item.url,
        content: {f: "json"}
      }).then(lang.hitch(this, function () {
        item.serviceOk = this.ITEM_STATUS.OK;
        this.itemsStore.put(item);
      }), lang.hitch(this, function (error) {
        item.serviceOkError = error;
        item.serviceOk = this.ITEM_STATUS.ERROR;
        item.hasError = true;
        this.itemsStore.put(item);
      }));

      this.statusHandles.push(statusHandle);
    },

    /**
     *
     */
    clearPreviousStatusHandles: function () {
      array.forEach(this.statusHandles, lang.hitch(this, function (statusHandle) {
        if(!statusHandle.isFulfilled()) {
          console.info("Status handle not fulfilled: ", statusHandle);
          statusHandle.cancel("User Cancel", false);
        }
      }));
      this.statusHandles = [];
    },

    /**
     *
     * @param selectedGroup
     */
    updateGroupItems: function (selectedGroup) {

      // CLEAR PREVIOUS CHECKS //
      this.clearPreviousStatusHandles();

      // INIT STATUS INFOS //
      this.initStatusInfos();

      // HAS GROUP BEEN RECENTLY CHECKED //
      if(selectedGroup.lastChecked) {
        var alreadyCheckedMessage = lang.replace("This group was checked recently: {0}", [locale.format(selectedGroup.lastChecked, {formatLength: "medium"})]);
        this.itemsList.set("noDataMessage", alreadyCheckedMessage);
        this.itemsList.set("store", null);

      } else {
        this.itemsList.set("noDataMessage", "Searching...");
        this.itemsList.set("store", null);

        // QUERY PARAMS //
        var queryParams = {num: 100, sortField: "title", sortOrder: "asc"};

        // GET GROUP ITEMS //
        this.updateSelectedGroupQuery(selectedGroup, queryParams, true);
      }

    },

    /**
     *
     * @param selectedGroup
     * @param queryParams
     * @param isFirst
     */
    updateSelectedGroupQuery: function (selectedGroup, queryParams, isFirst) {

      dom.byId("totals-node").innerHTML = "Searching...";

      // GET GROUP ITEMS //
      selectedGroup.queryItems(queryParams).then(lang.hitch(this, function (queryResponse) {

        if(isFirst) {
          this.itemsStore = new Observable(new Memory({data: queryResponse.results}));
          this.itemsList.set("noDataMessage", "No Items");
          this.itemsList.set("store", this.itemsStore);
        } else {
          array.forEach(queryResponse.results, lang.hitch(this, function (item) {
            this.itemsStore.add(item);
          }));
        }

        // UPDATE STATUS INFOS //
        this.updateStatusInfos(selectedGroup, this.itemsStore, queryResponse);

        // UPDATE GROUP LAST CHECK PROPERTY //
        this._setLastGroupCheck(selectedGroup, new Date());

      }), lang.hitch(this, function (error) {
        console.warn(error);
      }));

    },

    /**
     *
     * @param selectedGroup
     * @param dataStore
     * @param queryResponse
     */
    updateStatusInfos: function (selectedGroup, dataStore, queryResponse) {

      var resultDetailsPage = dataStore.query({});
      resultDetailsPage.observe(lang.hitch(this, this.aggregateStatusInfos), true);

      var totalsNode = dom.byId("totals-node");
      totalsNode.innerHTML = "";

      put(totalsNode, "span", lang.replace("Item Count: {0} of {1}", [resultDetailsPage.length, queryResponse.total]));
      if(queryResponse.nextQueryParams.start > -1) {

        var nextQueryNode = put(totalsNode, "span.next-query span.next-label $ <", "( Next: ");
        var nextStartNode = put(nextQueryNode, "span.next-start", queryResponse.nextQueryParams.start);
        on(nextStartNode, "click", lang.hitch(this, function (evt) {

          // GET GROUP ITEMS //
          this.updateSelectedGroupQuery(selectedGroup, queryResponse.nextQueryParams, false);

        }));
        put(nextQueryNode, "span.next-label", " )");
      }
    },

    /**
     * TODO: FIND BETTER WAY TO DO THIS... INCREMENTAL UPDATES...
     */
    aggregateStatusInfos: function () {

      var totalsStore = new Memory({
        data: lang.clone(this.emptyStatusTotals)
      });
      array.forEach(this.itemsStore.query({}), lang.hitch(this, function (item) {
        totalsStore.get("detailsPageOk")[item.detailsPageOk] += 1;
        totalsStore.get("webAppOk")[item.webAppOk] += 1;
        totalsStore.get("webMapOk")[item.webMapOk] += 1;
        totalsStore.get("serviceOk")[item.serviceOk] += 1;
      }));
      setTimeout(lang.hitch(this, function () {
        this.updateStatusInfosDisplay(totalsStore.query());
      }), 100);

    },

    /**
     *
     */
    initStatusInfos: function () {
      dom.byId("totals-node").innerHTML = "Item Count:";
      this.updateStatusInfosDisplay(this.emptyStatusTotals);
    },

    /**
     *
     * @param totalsData
     */
    updateStatusInfosDisplay: function (totalsData) {

      array.forEach(totalsData, lang.hitch(this, function (totalsItem) {

        var totalsNode = dom.byId(totalsItem.nodeId);
        totalsNode.innerHTML = "";

        put(totalsNode, "tr td.total-label", totalsItem.label, {colSpan: 2});
        put(totalsNode, "tr td.total-name $ <td.total-value span.$ $", "Checking:", ((totalsItem.Checking > 0) ? "checking" : ""), totalsItem.Checking);
        put(totalsNode, "tr td.total-name $ <td.total-value span $", "Ok:", totalsItem.Ok);
        put(totalsNode, "tr td.total-name $ <td.total-value span.$ $", "Error:", (totalsItem.Error > 0 ? "haveErrors" : "" ), totalsItem.Error);
        put(totalsNode, "tr td.total-name $ <td.total-value span $", "N/A:", totalsItem.Unknown);

      }));

    }
  });

  /**
   *  DISPLAY MESSAGE OR ERROR
   *
   * @param messageOrError {string | Error}
   * @param smallText {boolean}
   */
  MainApp.displayMessage = function (messageOrError, smallText) {
    require(["dojo/query", "put-selector/put"], function (query, put) {
      query(".message-node").orphan();
      if(messageOrError) {
        if(messageOrError instanceof Error) {
          put(document.body, "div.message-node.error-node span", messageOrError.message);
        } else {
          if(messageOrError.declaredClass === "esri.tasks.GPMessage") {
            var simpleMessage = messageOrError.description;
            put(document.body, "div.message-node span.esriJobMessage.$ span.small-text $", messageOrError.type, simpleMessage);
          } else {
            put(document.body, smallText ? "div.message-node span.small-text" : "div.message-node span", messageOrError);
          }
        }
      }
    });
  };

  MainApp.version = "0.0.1";

  return MainApp;
});