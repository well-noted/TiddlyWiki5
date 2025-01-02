/*\
title: $:/core/modules/parsers/audioparser.js
type: application/javascript
module-type: parser
\*/
(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	// Debug logging system
	const Debug = {
		enabled: true,
		prefix: '🎵 [AudioParser]',

		log: function (message, data) {
			if (!this.enabled) return;
			if (data) {
				console.log(`${this.prefix} ${message}`, data);
			} else {
				console.log(`${this.prefix} ${message}`);
			}
		},

		error: function (message, error) {
			if (!this.enabled) return;
			console.error(`${this.prefix} ❌ ${message}`, error);
		},

		warn: function (message, data) {
			if (!this.enabled) return;
			console.warn(`${this.prefix} ⚠️ ${message}`, data);
		},

		state: function (audio) {
			if (!this.enabled) return;
			console.log(`${this.prefix} Audio State:`, {
				src: audio.currentSrc,
				readyState: audio.readyState,
				paused: audio.paused,
				currentTime: audio.currentTime,
				duration: audio.duration,
				initialized: audio.dataset.initialized,
				fullyInitialized: audio.dataset.fullyInitialized,
				settingTime: audio.dataset.settingTime
			});
		}
	};



	const BatchedUpdates = {
		updates: {},
		timeout: null,

		queue: function (tiddlerTitle, fields) {
			const currentTiddler = $tw.wiki.getTiddler(tiddlerTitle);
			const hasChanged = Object.entries(fields).some(([field, value]) =>
				currentTiddler?.fields[field] !== value
			);

			if (hasChanged) {
				this.updates[tiddlerTitle] = this.updates[tiddlerTitle] || {};
				Object.assign(this.updates[tiddlerTitle], fields);

				if (this.timeout) clearTimeout(this.timeout);
				this.timeout = setTimeout(() => this.flush(), 2000);
			}
		},

		flush: function () {
			const updates = Object.entries(this.updates).map(([title, fields]) => {
				const tiddler = $tw.wiki.getTiddler(title);
				return tiddler ? new $tw.Tiddler(tiddler, fields) : null;
			}).filter(Boolean);

			if (updates.length) {
				$tw.wiki.addTiddlers(updates);
			}

			this.updates = {};
			this.timeout = null;
		}
	};

	function getAudioTimestampField(audio) {
		const sourceElement = audio.querySelector('source');
		let originalSrc = sourceElement ?
			sourceElement.getAttribute('src') :
			audio.getAttribute('src');

		let hash = 5381;
		for (let i = 0; i < originalSrc.length; i++) {
			hash = (hash * 33) ^ originalSrc.charCodeAt(i);
		}
		return `audio-timestamp-${Math.abs(hash >>> 0)}`;
	}

	var AudioParser = function (type, text, options) {
		Debug.log('Creating new AudioParser instance', { type, hasText: !!text, options });

		const element = {
			type: "element",
			tag: "audio",
			attributes: {
				controls: { type: "string", value: "controls" },
				style: { type: "string", value: "width: 100%; object-fit: contain" },
				preload: { type: "string", value: "auto" },
				class: { type: "string", value: "tw-audio-element" }
			}
		};

		if (options._canonical_uri) {
			Debug.log('Using canonical URI', options._canonical_uri);
			element.children = [{
				type: "element",
				tag: "source",
				attributes: {
					src: { type: "string", value: options._canonical_uri },
					type: { type: "string", value: type }
				}
			}];
		} else if (text) {
			Debug.log('Using base64 text data');
			element.attributes.src = {
				type: "string",
				value: "data:" + type + ";base64," + text
			};
		}

		if ($tw.browser) {
			$tw.hooks.addHook("th-page-refreshed", function () {
				Debug.log('Page refresh detected');

				setTimeout(function () {
					const audioElements = document.getElementsByClassName("tw-audio-element");
					Debug.log(`Found ${audioElements.length} audio elements`);

					Array.from(audioElements).forEach(function (audio) {
						if (audio.dataset.initialized) {
							Debug.log('Audio already initialized, skipping');
							return;
						}

						Debug.log('Initializing audio element');
						audio.dataset.initialized = "true";

						// Force aggressive loading
						audio.preload = "auto";

						// Add event listeners
						audio.addEventListener('play', function () {
							Debug.log('Play event triggered');
							const currentTiddler = this.closest('[data-tiddler-title]');
							if (currentTiddler) {
								const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
								const savedTime = $tw.wiki.getTiddler(tiddlerTitle)
									?.fields[getAudioTimestampField(this)];
								if (savedTime && this.currentTime < 0.1) {
									Debug.log(`Restoring saved time: ${savedTime}`);
									this.currentTime = parseFloat(savedTime);
								}
							}
						});

						audio.addEventListener('pause', function () {
							Debug.log('Pause event triggered');
							const currentTiddler = this.closest('[data-tiddler-title]');
							if (currentTiddler) {
								const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
								const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
								if (tiddler) {
									Debug.log(`Saving time: ${this.currentTime}`);
									$tw.wiki.addTiddler(
										new $tw.Tiddler(
											tiddler,
											{ [getAudioTimestampField(this)]: this.currentTime.toString() }
										),
										{ suppressUpdate: true, quiet: true, dontNotify: true }
									);
								}
							}
						});

						audio.addEventListener('timeupdate', function () {
							if (!this.seeking &&
								(!this.lastUpdateTime ||
									(Date.now() - this.lastUpdateTime > 2000 &&
										Math.abs(this.currentTime - (this.lastSavedTime || 0)) > 1))) {

								const currentTiddler = this.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
									if (tiddler) {
										this.lastSavedTime = this.currentTime;
										this.lastUpdateTime = Date.now();

										Debug.log(`Saving time update: ${this.currentTime}`);
										$tw.wiki.addTiddler(
											new $tw.Tiddler(
												tiddler,
												{ [getAudioTimestampField(this)]: this.currentTime.toString() }
											),
											{ suppressUpdate: true, quiet: true, dontNotify: true }
										);
									}
								}
							}
						});

						// Load the audio file
						const xhr = new XMLHttpRequest();
						xhr.open('GET', audio.currentSrc, true);
						xhr.responseType = 'blob';

						xhr.onprogress = function (e) {
							if (e.lengthComputable) {
								Debug.log(`Loading progress: ${((e.loaded / e.total) * 100).toFixed(2)}%`);
							}
						};

						xhr.onload = function () {
							if (xhr.status === 200) {
								Debug.log('XHR load successful');
								const blob = new Blob([xhr.response], { type });
								const url = URL.createObjectURL(blob);

								Debug.log('Setting audio src to blob URL');
								audio.src = url;

								// Restore timestamp after loading
								const currentTiddler = audio.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									const savedTime = $tw.wiki.getTiddler(tiddlerTitle)
										?.fields[getAudioTimestampField(audio)];
									if (savedTime) {
										Debug.log(`Restoring saved time: ${savedTime}`);
										audio.currentTime = parseFloat(savedTime);
									}
								}
							}
						};

						xhr.onerror = function (error) {
							Debug.error('XHR error occurred', error);
						};

						xhr.send();
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