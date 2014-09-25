﻿// A jQuery plugin to detect magnetic card swipes.  Requires a card reader that simulates a keyboard.
// This expects a card that encodes data on track 1, though it also reads tracks 2 and 3.  Most cards
// use track 1.  This won't recognize cards that don't use track 1, or work with a reader that
// doesn't read track 1.
//
// See http://en.wikipedia.org/wiki/Magnetic_card to understand the format of the data on a card.
//
// Uses pattern at https://github.com/umdjs/umd/blob/master/jqueryPlugin.js to declare
// the plugin so that it works with or without an AMD-compatible module loader, like RequireJS.
(function (factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['jquery'], factory);
    } else {
        // Browser globals
        factory(jQuery);
    }
}(function ($) {

	// State definitions:
	var states = { IDLE: 0, PENDING: 1, READING: 2, DISCARD: 3, PREFIX: 4 };

	// Holds current state
	var state = states.IDLE;

	// Array holding scanned characters
	var scanbuffer;
	
	// Interdigit timer
	var timerHandle = 0;

	// Keypress listener
	var listener = function (e) {
		//console.log(e.which + ': ' + String.fromCharCode(e.which));
		switch (state) {

			// IDLE: Look for '%', and jump to PENDING.  Otherwise, pass the keypress through.
			case states.IDLE:
				//console.log('IDLE');
				// Look for '%'
				if (e.which == 37) {
					state = states.PENDING;
					//console.log('IDLE -> PENDING');
					scanbuffer = new Array();
					processCode(e.which);
					e.preventDefault();
					e.stopPropagation();
					startTimer();
				}

				// Look for prefix, if defined
				if (settings.prefixCode && settings.prefixCode == e.which) {
					state = states.PREFIX;
					//console.log('IDLE -> PREFIX');
					e.preventDefault();
					e.stopPropagation();
					startTimer();
				}

				break;

			// PENDING: Look for A-Z, then jump to READING.  Otherwise, pass the keypress through, reset and jump to IDLE.
			case states.PENDING:
				//console.log('PENDING');
				// Look for format code character, A-Z. Almost always B for cards
				// used by the general public.
				if (e.which >= 65 && e.which <= 90) {
					//console.log('PENDING -> READING');
					state = states.READING;

					// Leaving focus on a form element wreaks browser-dependent
					// havoc because of keyup and keydown events.  This is a
					// cross-browser way to prevent trouble.
					$("input").blur();

					processCode(e.which);
					e.preventDefault();
					e.stopPropagation();
					startTimer();
				}
				else {
					clearTimer();
					scanbuffer = null;
					//console.log('PENDING -> IDLE');
					state = states.IDLE;
				}
				break;

			// READING: Copy characters to buffer until newline, then process the scanned characters
			case states.READING:
				//console.log('READING');
				processCode(e.which);
				startTimer();
				e.preventDefault();
				e.stopPropagation();

				// Carriage return indicates end of scan
				if (e.which == 13) {
					clearTimer();
					state = states.IDLE;
					//console.log('READING -> IDLE');
					processScan();
				}

				if (settings.firstLineOnly && e.which == 63) {
					// End of line 1.  Return early, and eat remaining characters.
					state = states.DISCARD;
					processScan();
				}
				break;

			// DISCARD: Eat up characters until newline, then jump to IDLE
			case states.DISCARD:
				//console.log('DISCARD');
				e.preventDefault();
				e.stopPropagation();
				if (e.which == 13) {
					clearTimer();
					//console.log('DISCARD -> IDLE');
					state = states.IDLE;
					return;
				}

				startTimer();
				break;

			// PREFIX: Eat up characters until % is seen, then jump to PENDING
			case states.PREFIX:
				//console.log('PREFIX');

				// If prefix character again, pass it through and return to IDLE state.
				if (e.which == settings.prefixCode) {
					//console.log('PREFIX -> IDLE');
					state = states.IDLE;
					return;
				}

				// Eat character.
				e.preventDefault();
				e.stopPropagation();
				// Look for '%'
				if (e.which == 37) {
					state = states.PENDING;
					//console.log('PREFIX -> PENDING');
					scanbuffer = new Array();
					processCode(e.which);
				}
				startTimer();
		}
	};

	// Converts a scancode to a character and appends it to the buffer.
	var processCode = function (code) {
		scanbuffer.push(String.fromCharCode(code));
		//console.log(code);
	}

	var startTimer = function () {
		clearTimeout(timerHandle);
		timerHandle = setTimeout(onTimeout, settings.interdigitTimeout);
	};

	var clearTimer = function () {
		clearTimeout(timerHandle);
		timerHandle = 0;
	};

	// Invoked when the timer lapses.
	var onTimeout = function () {
		//console.log('Timeout!');
		if (state == states.READING) {
			processScan();
		}
		scanbuffer = null;
		state = states.IDLE;
	};


	// Processes the scanned card
	var processScan = function () {

		var rawData = scanbuffer.join('');

		// Invoke client parser and callbacks
		var parsedData = settings.parser.call(this, rawData);
		if (parsedData) {
			settings.success && settings.success.call(this, parsedData);
		}
		else {
			settings.error && settings.error.call(this, rawData);
		}
	};

	// Binds the event listener
	var bindListener = function () {
		$(document).bind("keypress.cardswipe", listener);
	};

	// Unbinds the event listener
	var unbindListener = function () {
		$(document).unbind(".cardswipe");
	};

	// Default parser. Separates raw data into up to three lines
	var defaultParser = function (rawData) {
		var pattern = new RegExp("^(%[^%;\\?]+\\?)(;[0-9\\:<>\\=]+\\?)?(;[0-9\\:<>\\=]+\\?)?");

		var match = pattern.exec(rawData);
		if (!match) return null;

		// Extract the three lines
		var cardData = {
			line1: match[1],
			line2: match[2],
			line3: match[3]
		};

		return cardData;
	};

	// Default callback used if no other specified. Works with default parser.
	var defaultSuccessCallback = function (cardData) {
		var text = ['Success!\nLine 1: ', cardData.line1, '\nLine 2: ', cardData.line2, '\nLine 3: ', cardData.line3].join('');
		alert(text);
	};

	// Defaults for settings
	var defaults = {
		enabled: true,
		interdigitTimeout: 250,
		success: defaultSuccessCallback,
		error: null,
		parser: defaultParser,
		firstLineOnly: false,
		prefixCharacter: null,
	};

	// Plugin actual settings
	var settings;


	// Callable plugin methods
	var methods = {
		init: function (options) {
			settings = $.extend(defaults, options || {});

			// Is a prefix character defined?
			if (settings.prefixCharacter) {
				if (settings.prefixCharacter.length > 1)
					throw 'PrefixCharacter must be blank or a single character';

				// Convert to character code
				settings.prefixCode = settings.prefixCharacter.charCodeAt(0);
			}

			if (settings.enabled)
				methods.enable();
		},

		disable: function (options) {
			unbindListener();
		},

		enable: function (options) {
			bindListener();
		}
	};


	// The extension proper.  Dispatches methods using the usual jQuery pattern.
	$.cardswipe = function (method) {
		// Method calling logic. If named method exists, execute it with passed arguments
		if (methods[method]) {
			return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
		}
		// If no argument, or an object passed, invoke init method.
		else if (typeof method === 'object' || !method) {
			return methods.init.apply(this, arguments);
		}
		else {
			throw 'Method ' + method + ' does not exist on jQuery.cardswipe';
		}
	}

}));
