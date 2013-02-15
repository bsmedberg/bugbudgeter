/**
 * Copyright 2013 - The Mozilla Foundation <http://www.mozilla.org/>
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *    http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var kComponents = {
/*
  "Core": ["Plug-ins"],
*/

  "Plugins": null, // all bugs in "Plugins"
  "Core": [
    "Plug-ins",
    "XPCOM",
    "IPC",
    "js-ctypes",
    "Preferences: Backend",
    "Profile: BackEnd",
    "String",
  ],
  "Toolkit": [
    "Plugin Finder Service",
    "Startup and Profile System",
    "XULRunner",
  ],
  "Firefox": [
    "WinQual Reports",
  ],
};

var kFetchTags = [
  'CtPDefault',
  'CtPUR',
];

var kWhiteboardTags = {
  "CtPUR": ["+", "-", "?"],
  "CtPDefault": ["P1", "P2", "P3", "-", "?"],
  "Snappy": ["P1", "P2", "P3", "-", "?"]
}

function makeWhiteboardRE(tag)
{
  return new RegExp('\\[' + escapeRegExp(tag) + ':([^\\]]*)\\]', 'i');
}

function replaceOrAddWhiteboardTag(whiteboard, tag, value)
{
  var newval = '[' + tag + ':' + value + ']';

  var re = makeWhiteboardRE(tag);
  var r = re.exec(whiteboard);
  if (r === null) {
    if (whiteboard == '') {
      return newval;
    }
    return newval + ' ' + whiteboard;
  }
  return whiteboard.replace(re, newval);
}

var gBugs;
var gPending;
var gPendingShards;

function fetchQ()
{
  $('#login').fadeOut();
  $('#progressbar').progressbar({value: false});

  setStatus("Retrieving bugzilla configuration...");
  getConfiguration(function() {
    setFieldData();
    fetchBugs();
  });
}

var kCF = /^cf_(status|tracking|blocking)/;
var kCFFirefox = /^cf_tracking_firefox(\d+)/;
var gFields;
var gCurrentTracking = 0;

function setFieldData()
{
  var fields = [
    'update_token',
    'assigned_to',
    'component',
    'id',
    'keywords',
    'groups',
    'last_change_time',
    'priority',
    'product',
    'resolution',
    'status',
    'summary',
    'whiteboard'
  ];
  for (var field in gConfiguration.field) {
    if (kCF.test(field)) {
      fields.push(field);
    }
    var r = kCFFirefox.exec(field);
    if (r != null) {
      var n = parseInt(r[1]);
      if (n > gCurrentTracking) {
        gCurrentTracking = n;
      }
    }
  }
  gFields = fields.join(',');
}

// Because of limitation in bzAPI, fetch bugs in two steps:
// * fetch just the list of bug IDs we will need later
// * fetch the actual bug data in groups of 25 bugs
//
// Fetching everything at once either ends up using too much memory on the
// BzAPI server, or exceeding URL length limits.

var kShard = 25;
var gPendingBugs;
var gPendingMap;

function fetchBugList(list)
{
  $.each(list, function(i, bug) {
    if (bug.id in gPendingMap) {
      return;
    }
    gPendingMap[bug.id] = true;
    gPendingBugs.push(bug.id);
  });
}

function fetchBugs()
{
  setStatus("Retrieving bugs...");

  gPending = 0;
  gPendingShards = 0;
  gPendingBugs = [];
  gPendingMap = {};

  gBugs = { };

  var qlist = []

  $.each(kComponents, function(product, components) {
    var q = {
      "resolution": "---",
      "product": product,
      "include_fields": "id",
    };
    if (components !== null) {
      q["component"] = components;
    }
    qlist.push(q);

    for (var version = gCurrentTracking - 2;
         version <= gCurrentTracking;
         ++version) {
      q = {
        "product": product,
        "include_fields": "id"
      };
      if (components !== null) {
        q["component"] = components;
      }
      q["cf_tracking_firefox" + version] = "+";

      $.each(['wontfix', 'fixed', 'unaffected', 'verified', 'disabled', 'verified disabled'], function(i, status) {
        q["field0-" + i + "-0"] = 'cf_status_firefox' + version;
        q["type0-" + i + "-0"] = 'notequals';
        q["value0-" + i + "-0"] = status;
      });
      qlist.push(q);
    };
  });

  $.each(kFetchTags, function(i, tag) {
    var q = {
      "resolution": "---",
      "whiteboard": tag,
      "whiteboard_type": "contains",
      "include_fields": "id",
    };
    qlist.push(q);
  });

  $.each(qlist, function(i, q) {
    gPending++;
    makeRequest({
      method: 'bug',
      query: q,
      success: function(d) {
        fetchBugList(d.bugs);
        --gPending;
        fetchShards();
      }
    });
  });
}

function fetchShard(ids)
{
  gPendingShards++;
  makeRequest({
    method: 'bug',
    query: {
      id: ids,
      include_fields: gFields
    },
    success: function(d) {
      $.each(d.bugs, function(i, bug) {
        gBugs[bug.id] = bug;
      });
      --gPendingShards;
      if (gPending == 0) {
        var total = Object.keys(gPendingMap).length;
        var done = Object.keys(gBugs).length;
        $('#progressbar').progressbar('value', done / total * 100);
      } 
      setupTable();
    }
  });
}

function fetchShards()
{
  while (gPendingBugs.length >= kShard) {
    var ids = gPendingBugs.slice(0, kShard);
    gPendingBugs = gPendingBugs.slice(kShard);
    fetchShard(ids);
  }

  if (gPending == 0 && gPendingBugs.length) {
    fetchShard(gPendingBugs);
    gPendingBugs = [];
  }
}

function makeMeta(bug)
{
  var meta = [];
  meta = meta.concat(bug.keywords);
  for (var prop in bug) {
    if (kCF.test(prop)) {
      var v = bug[prop];
      if (v == '---' || v == '') {
        continue;
      }
      var s = gConfiguration.field[prop].description + ":" + v;
      meta.push(s);
    }
  }
  if (bug.whiteboard != '') {
    meta.push(bug.whiteboard);
  }
  return meta.join(' ');
}

function makeUser(user)
{
  if (user.name.indexOf('@') == -1) {
    return $('<span>').text(user.name).attr('title', user.real_name);
  }

  return $('<a>').text(user.name).attr('title', user.real_name).attr('href', 'mailto:' + user.name);
}

function makeBugPriority(bug)
{
  if (bug.priority == '--') {
    return 'P--';
  }
  return bug.priority;
}

function setupTable()
{
  var i;

  if (gPending > 0 || gPendingShards > 0) {
    return;
  }

  var insertBefore = $('#meta-th');
  $.each(kWhiteboardTags, function(tag) {
    insertBefore.before($('<th>').addClass('bugwb-' + tag).attr('colid', 'bugwb-' + tag).text(tag));
  });

  $.each([gCurrentTracking - 2, gCurrentTracking - 1, gCurrentTracking],
    function(i, tracking) {
      insertBefore.before($('<th>').addClass('bugtracking-' + tracking).attr('colid', 'bugtracking-' + tracking).text('t-' + tracking).attr("title", "tracking-firefox-" + tracking));
    });

  var rowTemplate = $('<tr><td class="bugid"><a class="buglink"><td class="bugSecurity"><td class="bugStatus"><td class="bugP"><td class="bugComponent"><td class="bugOwner"><td class="bugSummary">');
  $.each(kWhiteboardTags, function(tag) {
    rowTemplate.append($('<td class="bugwb">').addClass('bugwb-' + tag).attr('wbtag', tag));
  });
  $.each([gCurrentTracking - 2, gCurrentTracking - 1, gCurrentTracking],
    function(i, tracking) {
      rowTemplate.append($('<td class="bugtracking">').addClass('bugtracking-' + tracking).attr('tracking', tracking));
    });
  rowTemplate.append($('<td class="bugMeta"><td class="bugChanged">'));

  var tbody = $('#bugsbody');
  $.each(gBugs, function(id, bug) {
    var row = rowTemplate.clone().data('bugid', id);
    bug.row = row;
    tbody.append(row);
    updateRow(id);

  });

  $.tablesorter.addParser({
    id: 'trackingflag',
    is: function() { return false; },
    format: function(s) {
      switch (s) {
      case "+": return 0;
      case "?": return 1;
      case "-": return 3;
      case "": return 4;
      default: return 2;
      }
    },
    type: 'numeric',
  });
  $.tablesorter.addParser({
    id: 'pflag',
    is: function() { return false; },
    format: function(s) {
      var m = /^P(\d)$/.exec(s);
      if (m == null) {
        return 0;
      }
      return parseInt(m[1]);
    },
    type: 'numeric',
  });
  $.tablesorter.addParser({
    id: 'security',
    is: function() { return false; },
    format: function(s, table, cell) {
      return !$(cell).closest('tr').hasClass('secureBug');
    },
    type: 'numeric',
  });

  var defaultSort = {
    sortList: [[3, 0], [0, 1]],
    // sortForce: [[0, 1]], tablesorter bug
    headers: {
      0: {sorter: 'digit'},
      1: {sorter: 'security'},
      2: {sorter: 'text'},
      3: {sorter: 'pflag'},
      4: {sorter: 'text'},
      5: {sorter: 'text'},
      6: {sorter: false},
    }
  };
  var tagCount = Object.keys(kWhiteboardTags).length;
  for (i = 7; i < 7 + tagCount; ++i) {
    defaultSort.headers[i] = {sorter: 'text'};
  }
  for (i = 7 + tagCount; i < 10 + tagCount; ++i) {
    defaultSort.headers[i] = {sorter: 'trackingflag'};
  }
  defaultSort.headers[10 + tagCount] = {sorter: false};
  defaultSort.headers[11 + tagCount] = {sorter: 'isoDate'};

  $('.tablesorter').tablesorter(defaultSort);

  $('#body').removeClass('hidden');
  $('#progressbar').addClass('hidden');
  setStatus();
}

$(document).on('click', '.bugP', function(ev) {
  ev.preventDefault();
  if (gCurPopup && gCurPopup.element === this) {
    closePopup();
  } else {
    var el = this;
    openPopup({
      element: this,
      list: ["P--", "P1", "P2", "P3", "P5"],
      value: $(this).text(),
      listOnly: true,
      success: function(value) {
        var bugid = $(el).closest('tr').data('bugid');
        var bug = gBugs[bugid];
        if (value.match(/^P/)) {
          bug.priority = value;
        }
        else {
          bug.priority = '--';
        }
        updateRow(bugid);
        updateBug(bug, ['priority']);
      }});
  }
});

$(document).on('click', '.bugwb', function(ev) {
  ev.preventDefault();
  if (gCurPopup && gCurPopup.element === this) {
    closePopup();
  } else {
    var el = this;
    var tag = $(el).attr('wbtag');
    openPopup({
      element: this,
      list: kWhiteboardTags[tag],
      value: $(this).text(),
      listOnly: false,
      success: function(value) {
        var bugid = $(el).closest('tr').data('bugid');
        var bug = gBugs[bugid];
        bug.whiteboard = replaceOrAddWhiteboardTag(bug.whiteboard, tag, value);
        updateRow(bugid);
        updateBug(bug, ['whiteboard']);
      }});
  }
});

function updateRow(bugid)
{
  var bug = gBugs[bugid];
  var row = bug.row;
  row.find('.buglink').attr('href', 'https://bugzilla.mozilla.org/show_bug.cgi?id=' + bugid).text(bugid);
  if (bug.groups && bug.groups.length) {
    row.addClass('secureBug');
  }
  else {
    row.removeClass('securebug');
  }
  row.children('.bugStatus').text(bug.status.slice(0, 4));
  row.children('.bugP').text(makeBugPriority(bug));
  row.children('.bugComponent').text(bug.product + "/" + bug.component);
  row.children('.bugOwner').empty().append(makeUser(bug.assigned_to));
  row.children('.bugSummary').text(bug.summary);
  row.children('.bugMeta').text(makeMeta(bug));
  row.children('.bugChanged').text(bug.last_change_time.slice(0, 10));

  $.each(kWhiteboardTags, function(tag) {
    var cell = row.children('.bugwb').filter(function(el) { return $(this).attr('wbtag') == tag; });
    
    var r = makeWhiteboardRE(tag).exec(bug.whiteboard);

    if (r === null) {
      cell.text('')
    }
    else {
      cell.text(r[1].toUpperCase());
    }
  });

  $.each([gCurrentTracking - 2, gCurrentTracking - 1, gCurrentTracking],
         function(i, tracking) {
    var cell = row.children('.bugtracking').filter(function(el) { return $(this).attr('tracking') == tracking; });

    var v = bug['cf_tracking_firefox' + tracking];
    if (v === undefined || v == "---") {
      v = '';
    }
    cell.text(v);
  });
}

function updateBug(bug, fields)
{
  var o = {
    token: bug.update_token
  };
  $.each(fields, function(i, field) {
    o[field] = bug[field];
  });
  makeRequest({method: 'bug',
               params: [bug.id],
               httpMethod: 'PUT',
               data: JSON.stringify(o)});
}
