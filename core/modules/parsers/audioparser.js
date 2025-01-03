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

	// BatchedUpdates system for optimized tiddler updates
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
				Debug.log('Page refresh detected');

				setTimeout(function () {
					const wrappers = document.getElementsByClassName("audio-wrapper");
					Debug.log(`Found ${wrappers.length} audio wrappers`);

					Array.from(wrappers).forEach(function (wrapper) {
						const audio = wrapper.querySelector('.tw-audio-element');
						const backButton = wrapper.querySelector('.skip-backward');
						const forwardButton = wrapper.querySelector('.skip-forward');

						Debug.state(audio);

						if (!audio.dataset.initialized) {
							Debug.log('Initializing audio element');
							audio.dataset.initialized = "true";

							// Skip functions
							const skipBackward = () => {
								audio.currentTime = Math.max(0, audio.currentTime - 15);
							};

							const skipForward = () => {
								audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
							};

							// Button events
							backButton.addEventListener('click', (e) => {
								e.preventDefault();
								skipBackward();
							});

							forwardButton.addEventListener('click', (e) => {
								e.preventDefault();
								skipForward();
							});

							// Mobile touch events
							['touchstart'].forEach(event => {
								backButton.addEventListener(event, function (e) {
									e.preventDefault();
									this.style.background = '#666666';
									skipBackward();
								});
								forwardButton.addEventListener(event, function (e) {
									e.preventDefault();
									this.style.background = '#666666';
									skipForward();
								});
							});

							// Button hover effects
							['mouseenter', 'touchstart'].forEach(event => {
								backButton.addEventListener(event, () => {
									backButton.style.background = '#666666';
								});
								forwardButton.addEventListener(event, () => {
									forwardButton.style.background = '#666666';
								});
							});

							['mouseleave', 'touchend'].forEach(event => {
								backButton.addEventListener(event, () => {
									backButton.style.background = '#4a4a4a';
								});
								forwardButton.addEventListener(event, () => {
									forwardButton.style.background = '#4a4a4a';
								});
							});

							if ('mediaSession' in navigator) {
								// Set up basic controls
								navigator.mediaSession.setActionHandler('play', () => {
									audio.play();
									updateMediaState();
								});

								navigator.mediaSession.setActionHandler('pause', () => {
									audio.pause();
									updateMediaState();
								});

								// Add back the skip controls
								const skipTime = 10; // Skip time in seconds

								navigator.mediaSession.setActionHandler('previoustrack', () => {
									audio.currentTime = Math.max(audio.currentTime - skipTime, 0);
									updateMediaState();
								});

								navigator.mediaSession.setActionHandler('nexttrack', () => {
									audio.currentTime = Math.min(audio.currentTime + skipTime, audio.duration);
									updateMediaState();
								});

								// Function to update media state
                                const updateMediaState = () => {
                                    if (!audio.duration || isNaN(audio.duration)) return;

                                    try {
                                        // Convert time to milliseconds for Android
                                        const positionMs = Math.floor(audio.currentTime * 1000);
                                        const durationMs = Math.floor(audio.duration * 1000);

                                        // Set both state and position
                                        navigator.mediaSession.setState(
                                            audio.paused ? PlaybackState.PAUSED : PlaybackState.PLAYING,
                                            positionMs,
                                            audio.paused ? 0 : 1.0,
                                            durationMs
                                        );

                                        // Update position state
                                        navigator.mediaSession.setPositionState({
                                            duration: audio.duration,
                                            position: audio.currentTime,
                                            playbackRate: audio.playbackRate
                                        });
                                    } catch (error) {
                                        Debug.warn('Failed to update media session state', error);
                                    }
                                };

                                let animationFrameId;
                                
                                const updateLoop = () => {
                                    if (!audio.paused) {
                                        updateMediaState();
                                        animationFrameId = requestAnimationFrame(updateLoop);
                                    }
                                };

                                // Update during playback
                                audio.addEventListener('play', () => {
                                    updateLoop();
                                });

                                audio.addEventListener('pause', () => {
                                    if (animationFrameId) {
                                        cancelAnimationFrame(animationFrameId);
                                    }
                                    updateMediaState();
                                });

                                // Handle state changes
                                ['seeking', 'seeked'].forEach(event => {
                                    audio.addEventListener(event, updateMediaState);
                                });
							}
							
							// Playback position events
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
									BatchedUpdates.queue(tiddlerTitle, {
										[getAudioTimestampField(this)]: this.currentTime.toString()
									});
								}
							});

							audio.addEventListener('timeupdate', function () {
								if (!this.seeking &&
									(!this.lastUpdateTime ||
										(Date.now() - this.lastUpdateTime > 5000 &&
											Math.abs(this.currentTime - (this.lastSavedTime || 0)) > 2))) {

									const currentTiddler = this.closest('[data-tiddler-title]');
									if (currentTiddler) {
										const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
										this.lastSavedTime = this.currentTime;
										this.lastUpdateTime = Date.now();

										BatchedUpdates.queue(tiddlerTitle, {
											[getAudioTimestampField(this)]: this.currentTime.toString()
										});
									}
								}
							});

							audio.addEventListener('error', function () {
								Debug.error('Audio error occurred');
								if (this.src.startsWith('blob:')) {
									URL.revokeObjectURL(this.src);
								}
							});

							// Load audio with retry
							const loadAudio = function (retryCount = 0) {
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

										audio.src = url;
										audio.removeAttribute('data-loading');

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
									Debug.error('XHR error occurred, retrying...', error);
									if (retryCount < 3) {
										setTimeout(() => loadAudio(retryCount + 1), 1000 * Math.pow(2, retryCount));
									}
								};

								xhr.send();
							};

							loadAudio();
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