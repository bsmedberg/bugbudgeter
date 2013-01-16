const kComponents = {
  "Plugins": null, /* all bugs in "Plugins" */
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

var gBugs;
var gPending;
var gPendingShards;

function fetchQ()
{
  $('#login').fadeOut();
  setStatus("Retrieving bugzilla configuration...");
  getConfiguration(function() {
    setFieldData();
    fetchBugs();
  });
}

var kCF = /^cf_(status|tracking|blocking)/;
var gFields;
function setFieldData()
{
  var fields = [
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
  }
  gFields = fields.join(',');
}

// Because of limitation in bzAPI, fetch bugs in two steps:
// * fetch just the list of bug IDs we will need later
// * fetch the actual bug data in groups of 25 bugs
//
// Fetching everything at once either ends up using too much memory on the
// BzAPI server, or exceeding URL length limits.

const kShard = 25;
var gPendingBugs = [];

function fetchBugs()
{
  setStatus("Retrieving bugs...");

  gPending = 0;
  gPendingShards = 0;

  gBugs = { };

  $.each(kComponents, function(product, components) {
    var q = {
      "resolution": "---",
      "product": product,
      "include_fields": "id",
    };
    if (components !== null) {
      q["component"] = components;
    }
    gPending++;
    makeRequest({
      method: 'bug',
      query: q,
      success: function(d) {
        $.each(d.bugs, function(i, bug) {
          gPendingBugs.push(bug.id);
        });
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
  if (gPending > 0 || gPendingShards > 0) {
    return;
  }

  var tbody = $('#bugsbody');
  $.each(gBugs, function(id, bug) {
    var row = $('<tr>')
      .append($('<td class="bugid">').append($('<a>').attr('href', 'https://bugzilla.mozilla.org/show_bug.cgi?id=' + id).text(id)))
      .append($('<td class="bugStatus">').text(bug.status.slice(0, 4)))
      .append($('<td class="bugP">').text(makeBugPriority(bug)))
      .append($('<td class="bugComponent">').text(bug.product + "/" + bug.component))
      .append($('<td class="bugOwner">').append(makeUser(bug.assigned_to)))
      .append($('<td class="bugSummary">').text(bug.summary))
      .append($('<td class="bugMeta">').text(makeMeta(bug)))
      .append($('<td class="bugChanged">').text(bug.last_change_time.slice(0, 10)));
    tbody.append(row);
  });

  var defaultSort = {
    sortList: [[2, 0], [0, 0]],
    headers: {5: {sorter: false}, 6: {sorter: false}}
  };
  $('.tablesorter').tablesorter(defaultSort);

  $('#body').removeClass('hidden');
  setStatus();
}
