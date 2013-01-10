const bzapi = 'https://api-dev.bugzilla.mozilla.org/1.1';

const useCached = true;

var gConfiguration;

var logtext = "";
var errtext = "";

function setError(text)
{
  errtext += text;
  setStatus();
}

window.onerror = setError;

function setStatus(text)
{
  if (errtext) {
    $('#status').addClass('error').text('There was an error: ' + errtext);
    return;
  }

  if (!text) {
    $('#status').addClass('hidden');
  }
  else {
    $('#status').removeClass('hidden').text(text);
    log(text);
  }
}

function log(text)
{
  if (window.console)
    window.console.log(text);

  if (text.charAt(text.length - 1) != '\n')
    text += '\n';

  logtext += text;
}

// Given a dictionary, return its keys sorted alphabetically
function sortKeys(dict) {
  var r = [];
  for (var key in dict)
    r.push(key);

  r.sort();
  return r;
}

function addLoginData(data)
{
  var username = $('#bz_username').val();
  var password = $('#bz_password').val();
  if (username && username.length) {
    data.username = username;
    data.password = password;
  }
}

// settings.method
// settings.httpMethod
// settings.params
// settings.query
// settings.data
// settings.success
function makeRequest(settings)
{
  var parts = [bzapi];
  parts.push(settings.method);
  if (settings.params !== undefined)
    Array.prototype.push.apply(parts, settings.params);
  
  var query = settings.query === undefined ? {} : new Object(settings.query);
  addLoginData(query);
  
  var url = parts.join('/') + '?' + $.param(query, true);

  log('Making request to ' + url);

  var httpMethod = settings.httpMethod;
  if (httpMethod === undefined)
    httpMethod = 'GET';
  
  $.ajax({
    type: httpMethod,
    url: url,
    beforeSend: function(xhr) {
      xhr.setRequestHeader('Accept', 'application/json');
    },
    dataType: 'json',
    data: settings.data,
    contentType: 'application/json',
    success: settings.success,
    error: function(xhr, statustext, e) {
      log("Error retrieving " + url + ": " + statustext + ": " + e + "response text: " + xhr.responseText);
      setError("Error retreiving URL: " + url);
    }
  });
}

if (useCached) {
  getConfiguration = function getConfiguration_cached(cb)
  {
    $.ajax({
      url: 'configuration',
      dataType: 'json',
      success: function(data) {
        gConfiguration = data;
        cb();
      },
      error: function(xhr, statustext, e) {
        log("Error retreiving data: " + statustext + ": " + e + "response text: " + xhr.responseText);
      }
    });
  }
}
else {
  getConfiguration = function getConfiguration_live(cb)
  {
    makeRequest({
      method: 'configuration',
      success: function(data) {
        log('Got configuration response');
        gConfiguration = data;
        cb();
      }
    });
  }
}

$(document).on("click", '.expando', function() {
  if ($(this).hasClass('collapsed')) {
    $(this).removeClass('collapsed');
    $(this).nextUntil(':header').fadeIn();
  }
  else {
    $(this).addClass('collapsed');
    $(this).nextUntil(':header').fadeOut();
  }

  $(document).trigger('expandoschanged');
});

// Expand the sections in "idlist" and collapse the others
function setExpandos(idlist)
{
  var idmap = {};
  $.each(idlist, function(i, id) {
    idmap[id] = true;
  });

  $('.expando').each(function() {
    if ($(this).attr('id') in idmap) {
      $(this).removeClass('collapsed');
      $(this).nextUntil(':header').show();
    }
    else {
      $(this).addClass('collapsed');
      $(this).nextUntil(':header').hide();
    }
  });
}
