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

var bzapi = 'https://api-dev.bugzilla.mozilla.org/1.2';

var useCached = false;
var cacheLog = false;

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

$.fn.isAfter = function(elem) {
  if (typeof(elem) == "string") {
    elem = $(elem);
  }
  return this.add(elem).index(elem) == 0;
};

// Given a dictionary, return its keys sorted alphabetically
function sortKeys(dict) {
  var r = [];
  for (var key in dict)
    r.push(key);

  r.sort();
  return r;
}

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
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

  var httpMethod = settings.httpMethod;
  if (httpMethod === undefined)
    httpMethod = 'GET';

  if (httpMethod == 'GET') {
    var bzapire = new RegExp(escapeRegExp(bzapi));
    var filere = /[\?\&]/g;
    var percentre = /%/g;
    var cacheURL = url.replace(bzapire, 'cache').replace(filere, '_').replace(percentre, '%25');
    var cacheURL = cacheURL.match(/.{1,200}/g).join('/');

    if (useCached) {
      url = cacheURL;
    }
    else if (cacheLog) {
      console.log("Please cache " + url + " as " + cacheURL);
    }
  }
  
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

function getConfiguration(cb)
{
  makeRequest({
    method: 'configuration',
    success: function(data) {
      gConfiguration = data;
      cb();
    }
  });
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

$(document).on('input', '.tablefilter', function() {
  var input = this;
  var words = $(input).val().split(/\s+/);

  // first table after this in DOM position
  var table = $('table').filter(function() {
    return $(this).isAfter(input);
  }).first();

  var shown = 0;
  var rows = $('tbody tr', table).each(function() {
    var t = $(this).text();
    for (var i = 0; i < words.length; ++i) {
      if (t.indexOf(words[i]) == -1) {
        $(this).hide();
        return;
      }
    }
    $(this).show();
    ++shown;
  });
  var totaltext;
  if (shown == rows.length) {
    totaltext = '';
  }
  else {
    totaltext = "Showing " + shown + " of " + rows.length;
  }
  $(this).nextAll('.filtertotal').text(totaltext);
});

var gCurPopup;

/**
 * Open a list popup under a specified element.
 * {
 *   element: el,
 *   list: [options],
 *   value: currentValue,
 *   listOnly: true/false
 *   success: function(newvalue)
 *  }
 */
function openPopup(popup)
{
  gCurPopup = popup;

  if (popup.listOnly) {
    $('#popupinput').hide();
  }
  else {
    $('#popupinput').show().val(popup.value);
  }

  var o = $(popup.element).offset();
  var list = $('#popuplist');
  list.empty();
  $.each(popup.list, function(i, label) {
    var li = $('<li>').text(label);
    if (label == popup.value) {
      li.attr('active', 'active');
    }
    list.append(li);
  });
  var pos = {top: o.top + $(popup.element).height(),
             left: o.left};
  $('#popup').show().offset(pos);
}

function closePopup()
{
  gCurPopup = null;
  $('#popup').hide();
}

$(document).on('keypress', closePopup);
$(document).on('click', function(ev) {
  if (ev.isDefaultPrevented()) {
    return;
  }
  if ($(ev.target).closest('#popup').length == 0) {
    closePopup();
  }
});

$(document).on('click', '#popuplist li', function() {
  if (!gCurPopup)
    return;
  var value = $(this).text();
  gCurPopup.success(value);
  closePopup();
});

$('#popupinput').on('change', function() {
  if (!gCurPopup)
    return;
  var value = $(this).val();
  gCurPopup.success(value);
  closePopup();
});
