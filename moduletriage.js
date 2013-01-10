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

function fetchQ()
{
  setStatus("Retrieving bugs...");
  $('#login').fadeOut();

  gPending = 0;
  gBugs = { };

  $.each(kComponents, function(product, components) {
    var q = {
      "resolution": "---",
      "product": product,
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
          gBugs[bug.id] = bug;
        });
	--gPending;
	if (0 == gPending) {
	  setupTable();
	}
      }
    });
  });
}

function setupTable()
{
  $('#bugs').removeClass('hidden');
}