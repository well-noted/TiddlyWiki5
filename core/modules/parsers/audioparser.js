/*\
title: $:/core/modules/parsers/audioparser.js
type: application/javascript
module-type: parser
\*/
(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	// Debug system with comprehensive state tracking
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

	// BatchedUpdates system remains unchanged
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

		// Create the element structure
		const element = {
			type: "element",
			tag: "div",
			attributes: {
				class: { type: "string", value: "audio-wrapper" },
				style: { type: "string", value: "display: flex; align-items: center; gap: 5px; padding: 5px; border-radius: 4px;" }
			},
			children: [
				{
					type: "element",
					tag: "button",
					attributes: {
						class: { type: "string", value: "skip-button skip-backward" },
						style: {
							type: "string", value: `
                            padding: 8px 12px;
                            background: #4a4a4a;
                            border: none;
                            border-radius: 4px;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-width: 70px;
                            transition: background-color 0.2s;
                        `}
					},
					children: [{ type: "text", text: "⏪ 15s" }]
				},
				{
					type: "element",
					tag: "audio",
					attributes: {
						controls: { type: "string", value: "controls" },
						style: { type: "string", value: "flex-grow: 1; object-fit: contain;" },
						preload: { type: "string", value: "auto" },
						class: { type: "string", value: "tw-audio-element" },
						"data-loading": { type: "string", value: "true" }
					}
				},
				{
					type: "element",
					tag: "button",
					attributes: {
						class: { type: "string", value: "skip-button skip-forward" },
						style: {
							type: "string", value: `
                            padding: 8px 12px;
                            background: #4a4a4a;
                            border: none;
                            border-radius: 4px;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-width: 70px;
                            transition: background-color 0.2s;
                        `}
					},
					children: [{ type: "text", text: "15s ⏩" }]
				}
			]
		};

		const audioElement = element.children[1];
		if (options._canonical_uri) {
			Debug.log('Using canonical URI', options._canonical_uri);
			audioElement.children = [{
				type: "element",
				tag: "source",
				attributes: {
					src: { type: "string", value: options._canonical_uri },
					type: { type: "string", value: type }
				}
			}];
		} else if (text) {
			Debug.log('Using base64 text data');
			audioElement.attributes.src = {
				type: "string",
				value: "data:" + type + ";base64," + text
			};
		}

		if ($tw.browser) {
			$tw.hooks.addHook("th-page-refreshed", function () {
				Debug.log('Page refresh detected - attempting to initialize AudioControls');

				// First, check if AudioControls is already initialized
				if (!window.audioControls) {
					Debug.log('AudioControls not found, checking for tiddler');

					// Try to get the AudioControls code from the wiki
					const audioControlsTiddler = $tw.wiki.getTiddler("$:/core/modules/parsers/audiocontrols.js");

					if (audioControlsTiddler) {
						Debug.log('Found AudioControls tiddler, executing code');
						try {
							// Execute the AudioControls code
							const AudioControlsCode = audioControlsTiddler.fields.text;
							(new Function('$tw', AudioControlsCode))($tw);

							// Initialize AudioControls
							if (typeof AudioControls !== 'undefined') {
								Debug.log('Creating new AudioControls instance');
								window.audioControls = new AudioControls();
							} else {
								Debug.error('AudioControls class not defined after execution');
							}
						} catch (e) {
							Debug.error('Error initializing AudioControls:', e);
						}
					} else {
						Debug.error('AudioControls tiddler not found in wiki');
					}
				} else {
					Debug.log('AudioControls already initialized');
				}

				// Add play event listener to audio elements
				setTimeout(function () {
					const wrappers = document.getElementsByClassName("audio-wrapper");
					Debug.log(`Found ${wrappers.length} audio wrappers`);

					Array.from(wrappers).forEach(function (wrapper) {
						const audio = wrapper.querySelector('.tw-audio-element');
						if (audio && !audio.dataset.initialized) {
							audio.addEventListener('play', function () {
								Debug.log('Audio play event triggered');
								if (window.audioControls) {
									Debug.log('Updating AudioControls with current audio');
									window.audioControls.currentAudio = this;
									window.audioControls.updateOverlay();
									const overlay = document.getElementById('audio-controls-overlay');
									if (overlay) {
										Debug.log('Showing overlay');
										overlay.classList.add('active');
									} else {
										Debug.error('Overlay element not found');
									}
								} else {
									Debug.error('AudioControls not initialized during play event');
								}
							});
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