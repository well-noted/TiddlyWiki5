/*\
title: $:/core/modules/parsers/audioparser.js
type: application/javascript
module-type: parser
\*/
(function () {

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	// Add this helper function at the top
	function getAudioTimestampField(audio) {
		// Get source from canonical URI or data URL
		const sourceElement = audio.querySelector('source');
		let originalSrc;
		
		if (sourceElement) {
			originalSrc = sourceElement.getAttribute('src');
		} else {
			originalSrc = audio.getAttribute('src');
			// If it's a data URL, extract a hash of the content
			if (originalSrc.startsWith('data:')) {
				originalSrc = originalSrc.substring(originalSrc.indexOf('base64,') + 7);
			}
		}
		
		// Create hash from source
		let hash = 0;
		for (let i = 0; i < originalSrc.length; i++) {
			const char = originalSrc.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		
		return `audio-timestamp-${Math.abs(hash)}`;
	}

	var AudioParser = function (type, text, options) {
		var element = {
			type: "element",
			tag: "audio",
			attributes: {
				controls: { type: "string", value: "controls" },
				style: { type: "string", value: "width: 100%; object-fit: contain" },
				preload: { type: "string", value: "auto" },
				class: { type: "string", value: "tw-audio-element" }
			}
		};

		// Set source with range support
		if (options._canonical_uri) {
			element.children = [{
				type: "element",
				tag: "source",
				attributes: {
					src: { type: "string", value: options._canonical_uri },
					type: { type: "string", value: type }
				}
			}];
		} else if (text) {
			element.attributes.src = { type: "string", value: "data:" + type + ";base64," + text };
		}

		if ($tw.browser) {
			$tw.hooks.addHook("th-page-refreshed", function () {
				setTimeout(function () {
					Array.from(document.getElementsByClassName("tw-audio-element")).forEach(function (audio) {
						if (!audio.dataset.initialized) {
							audio.dataset.initialized = "true";

							// Force aggressive loading
							audio.preload = "auto";
							audio.autobuffer = true;

							// Add play event listener
							audio.addEventListener('play', function () {
								var currentTiddler = audio.closest('[data-tiddler-title]');
								if (currentTiddler) {
									var tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									var savedTime = $tw.wiki.getTiddler(tiddlerTitle)?.fields[getAudioTimestampField(audio)];
									if (savedTime && audio.currentTime < 0.1) {
										audio.currentTime = parseFloat(savedTime);
									}
								}
							});

							// Add pause event listener
							audio.addEventListener('pause', function () {
								var currentTiddler = audio.closest('[data-tiddler-title]');
								if (currentTiddler) {
									var tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									var tiddler = $tw.wiki.getTiddler(tiddlerTitle);
									if (tiddler) {
										// Create a new tiddler silently
										$tw.wiki.addTiddler(
											new $tw.Tiddler(
												tiddler,
													{ [getAudioTimestampField(audio)]: audio.currentTime.toString() }
											),
											{ suppressUpdate: true, quiet: true, dontNotify: true }
										);
									}
								}
							});

							// Add timeupdate event listener
							audio.addEventListener('timeupdate', function() {
								// Only update if change is significant (>1 second)
								if (Math.abs(this.currentTime - (this.lastSavedTime || 0)) > 1) {
									var currentTiddler = audio.closest('[data-tiddler-title]');
									if (currentTiddler) {
										var tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
										var tiddler = $tw.wiki.getTiddler(tiddlerTitle);
										if (tiddler) {
											// Store current time
											this.lastSavedTime = this.currentTime;
											
											// Create a new tiddler silently
											$tw.wiki.addTiddler(
												new $tw.Tiddler(
													tiddler,
													{ [getAudioTimestampField(audio)]: audio.currentTime.toString() }
												),
												{ suppressUpdate: true, quiet: true, dontNotify: true }
											);
										}
									}
								}
							});

							// Create XMLHttpRequest to load full file
							var xhr = new XMLHttpRequest();
							xhr.open('GET', audio.currentSrc, true);
							xhr.responseType = 'blob';

							xhr.onprogress = function (e) {
								if (e.lengthComputable) {
									var percentComplete = (e.loaded / e.total) * 100;
									console.log("Loading: " + percentComplete.toFixed(2) + "%");
								}
							};

							xhr.onload = function () {
								if (xhr.status === 200) {
									var blob = new Blob([xhr.response], { type: type });
									var url = URL.createObjectURL(blob);
									audio.src = url;

									// Set timestamp after buffer is ready
									audio.addEventListener('canplaythrough', function () {
										var currentTiddler = audio.closest('[data-tiddler-title]');
										if (currentTiddler) {
											var tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
											var savedTime = $tw.wiki.getTiddler(tiddlerTitle)?.fields[getAudioTimestampField(audio)];
											if (savedTime) {
												audio.currentTime = parseFloat(savedTime);
											}
										}
									}, { once: true });
								}
							};

							xhr.send();
						}
					});
				}, 100);
			});
		}

		this.tree = [element];
		this.type = type;
	};

	exports["audio/ogg"] = AudioParser;
	exports["audio/mpeg"] = AudioParser;
	exports["audio/mp3"] = AudioParser;
	exports["audio/mp4"] = AudioParser;

})();