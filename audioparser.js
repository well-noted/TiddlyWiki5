/*\
title: $:/core/modules/parsers/audioparser.js
type: application/javascript
module-type: parser
\*/
(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

<<<<<<< HEAD

	const Debug = {
		enabled: true,
		prefix: '🎵 [AudioParser]',

=======
	// Debug system with comprehensive state tracking
	const Debug = {
		enabled: true,
		prefix: '🎵 [AudioParser]',

>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
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

<<<<<<< HEAD
=======
	// BatchedUpdates system remains unchanged
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
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
<<<<<<< HEAD
		const currentTiddler = audio.closest('[data-tiddler-title]');
		if (!currentTiddler) return null;

		const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
		const sourceElement = audio.querySelector('source');
		const audioSrc = sourceElement ?
			sourceElement.getAttribute('src') :
			audio.getAttribute('src');

		// The src already contains the correct tiddler reference
		return `timecode-${audioSrc}.${tiddlerTitle}`;
=======
		const sourceElement = audio.querySelector('source');
		let originalSrc = sourceElement ?
			sourceElement.getAttribute('src') :
			audio.getAttribute('src');

		let hash = 5381;
		for (let i = 0; i < originalSrc.length; i++) {
			hash = (hash * 33) ^ originalSrc.charCodeAt(i);
		}
		return `audio-timestamp-${Math.abs(hash >>> 0)}`;
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
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
			// First, ensure AudioControls is initialized
			$tw.hooks.addHook("th-page-refreshed", function () {
				Debug.log('Page refresh detected - initializing AudioControls');

				// Get AudioControls from wiki store
				const audioControlsTiddler = $tw.wiki.getTiddler("$:/core/modules/parsers/audiocontrols.js");

				if (audioControlsTiddler) {
					Debug.log('Found AudioControls tiddler, attempting to initialize');
					try {
						// Execute the AudioControls code
						const AudioControlsCode = audioControlsTiddler.fields.text;
						(new Function(AudioControlsCode))();

						// Initialize AudioControls instance
						if (!window.audioControls) {
							Debug.log('Creating new AudioControls instance');
							window.audioControls = new AudioControls();
						} else {
							Debug.log('AudioControls already initialized');
						}
					} catch (e) {
						Debug.error('Failed to initialize AudioControls:', e);
					}
				} else {
					Debug.error('AudioControls tiddler not found');
				}

				// Then proceed with audio wrapper initialization
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

							// Add debug logging for AudioControls initialization
							Debug.log('Checking AudioControls initialization status');
							if (!window.audioControls) {
								Debug.log('AudioControls not initialized, attempting to initialize');
								const audioControlsTiddler = $tw.wiki.getTiddler("$:/core/modules/parsers/audiocontrols.js");
								if (audioControlsTiddler) {
									try {
										Debug.log('Found AudioControls tiddler, executing code');
										const AudioControlsCode = audioControlsTiddler.fields.text;
										(new Function(AudioControlsCode))();
										Debug.log('AudioControls code executed successfully');
									} catch (e) {
										Debug.error('Failed to initialize AudioControls:', e);
									}
								} else {
									Debug.error('AudioControls tiddler not found');
								}
							} else {
								Debug.log('AudioControls already initialized');
							}

							// Add extensive debug logging for play/pause events
							audio.addEventListener('play', function () {
								Debug.log('Play event triggered - attempting to show overlay');
								Debug.log('AudioControls status:', window.audioControls ? 'exists' : 'not found');

								if (window.audioControls) {
									Debug.log('Setting current audio and updating overlay');
									window.audioControls.currentAudio = this;
									window.audioControls.updateOverlay();

									const overlay = document.getElementById('audio-controls-overlay');
									Debug.log('Overlay element:', overlay ? 'found' : 'not found');

									if (overlay) {
										Debug.log('Adding active class to overlay');
										overlay.classList.add('active');
										Debug.log('Overlay classes after addition:', overlay.classList.toString());
									} else {
										Debug.error('Audio controls overlay element not found');
									}
								} else {
									Debug.error('AudioControls not initialized during play event');
								}
							});

							// Add debug logging for overlay state changes
							const observeOverlay = new MutationObserver((mutations) => {
								mutations.forEach((mutation) => {
									if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
										Debug.log('Overlay class changed:',
											document.getElementById('audio-controls-overlay').classList.toString());
									}
								});
							});

							const overlay = document.getElementById('audio-controls-overlay');
							if (overlay) {
								Debug.log('Setting up overlay state observer');
								observeOverlay.observe(overlay, { attributes: true });
							}

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


							// Media Session API
							if ('mediaSession' in navigator) {
								// Set up basic controls
								navigator.mediaSession.setActionHandler('play', () => audio.play());
								navigator.mediaSession.setActionHandler('pause', () => audio.pause());

								// Set up skip controls using previoustrack/nexttrack
								navigator.mediaSession.setActionHandler('previoustrack', skipBackward);
								navigator.mediaSession.setActionHandler('nexttrack', skipForward);

								// Update metadata when loaded
								audio.addEventListener('loadedmetadata', function () {
									const currentTiddler = audio.closest('[data-tiddler-title]');
									const title = currentTiddler ?
										currentTiddler.getAttribute('data-tiddler-title') :
										'Audio';

									navigator.mediaSession.metadata = new MediaMetadata({
										title: title,
										artist: 'TiddlyWiki Audio',
										album: 'Audio Player'
									});
								});

<<<<<<< HEAD
=======
								// Add these right after the Media Session API initialization
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
								audio.addEventListener('play', function () {
									Debug.log('Play event triggered - checking AudioControls');
									if (!window.audioControls) {
										Debug.log('AudioControls not found, attempting to initialize');
										const audioControlsTiddler = $tw.wiki.getTiddler("$:/core/modules/parsers/audiocontrols.js");
										if (audioControlsTiddler) {
											try {
												const AudioControlsCode = audioControlsTiddler.fields.text;
												(new Function(AudioControlsCode))();
												window.audioControls = new AudioControls();
												Debug.log('AudioControls initialized successfully');
											} catch (e) {
												Debug.error('Failed to initialize AudioControls:', e);
											}
										}
									}

									if (window.audioControls) {
										Debug.log('Setting current audio and showing overlay');
										window.audioControls.currentAudio = this;
										window.audioControls.updateOverlay();
										const overlay = document.getElementById('audio-controls-overlay');
										if (overlay) {
											overlay.classList.add('active');
											Debug.log('Overlay activated');
										} else {
											Debug.error('Overlay element not found');
										}
									}
								});

								audio.addEventListener('pause', function () {
									Debug.log('Pause event triggered');
<<<<<<< HEAD
									// Update play button state
=======
									// Only update play button state, don't hide overlay
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
									if (window.audioControls && window.audioControls.elements.playButton) {
										window.audioControls.elements.playButton.innerHTML = '▶️';
									}
								});

								// Update playback state and position
								const updatePlaybackState = () => {
									if (!audio.duration || isNaN(audio.duration)) return;

									try {
										// Set playback state
										navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";

<<<<<<< HEAD
										// Ensure position is valid and within bounds
										const position = Math.min(Math.max(0, audio.currentTime || 0), audio.duration);
										const duration = Math.max(position, audio.duration);

										// Only update position state if we have valid values
										if (isFinite(duration) && isFinite(position)) {
											navigator.mediaSession.setPositionState({
												duration: duration,
												position: position,
												playbackRate: audio.playbackRate || 1.0
											});
										}
=======
										// Update position state with current values
										navigator.mediaSession.setPositionState({
											duration: audio.duration,
											position: audio.currentTime,
											playbackRate: audio.playbackRate || 1.0
										});
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
									} catch (error) {
										Debug.warn('Failed to update media session state', error);
									}
								};

								// Update on all relevant events
<<<<<<< HEAD
								['play', 'pause', 'timeupdate', 'seeking', 'seeked', 'durationchange'].forEach(event => {
=======
								['play', 'pause', 'timeupdate', 'seeking', 'seeked'].forEach(event => {
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
									audio.addEventListener(event, updatePlaybackState);
								});

								// Initial state update
								audio.addEventListener('loadedmetadata', updatePlaybackState);
							}

<<<<<<< HEAD
							// Enhanced Media Session API support
							if ('mediaSession' in navigator) {
								const updateMetadata = () => {
									const currentTiddler = audio.closest('[data-tiddler-title]');
									const title = currentTiddler ? 
										currentTiddler.getAttribute('data-tiddler-title') : 
										'Audio';

									navigator.mediaSession.metadata = new MediaMetadata({
										title: title,
										artist: 'TiddlyWiki Audio',
										album: 'Audio Player',
										duration: audio.duration
									});

									// Notify Android of metadata update
									if (window.Android && window.Android.updateMediaMetadata) {
										window.Android.updateMediaMetadata(
											title,
											'TiddlyWiki Audio',
											Math.round(audio.duration * 1000)
										);
									}
								};

								const updateAndroidPlaybackState = () => {
									try {
										if (!audio.duration || isNaN(audio.duration)) return;
										
										if (window.Android && window.Android.updatePlaybackState) {
											const position = Math.min(Math.max(0, audio.currentTime || 0), audio.duration);
											window.Android.updatePlaybackState(
												!audio.paused,
												Math.round(position * 1000)
											);
										}
									} catch (error) {
										Debug.error('Error updating Android playback state:', error);
									}
								};

								const safePlayback = async () => {
									try {
										if (!audio.paused) return; // Already playing
										await audio.play();
										updateAndroidPlaybackState();
									} catch (error) {
										Debug.error('Playback failed:', error);
										// Reset state on error
										if (window.Android && window.Android.updatePlaybackState) {
											window.Android.updatePlaybackState(false, 0);
										}
									}
								};

								const safePause = () => {
									try {
										if (audio.paused) return; // Already paused
										audio.pause();
										updateAndroidPlaybackState();
									} catch (error) {
										Debug.error('Pause failed:', error);
									}
								};

								const safeSeek = (position) => {
									try {
										const normalizedPosition = Math.min(Math.max(0, position), audio.duration || 0);
										audio.currentTime = normalizedPosition;
										updateAndroidPlaybackState();
									} catch (error) {
										Debug.error('Seek failed:', error);
									}
								};

								// Replace existing media session handlers
								navigator.mediaSession.setActionHandler('play', () => safePlayback());
								navigator.mediaSession.setActionHandler('pause', () => safePause());
								navigator.mediaSession.setActionHandler('seekto', (details) => {
									if (details.seekTime !== undefined) {
										safeSeek(details.seekTime);
									}
								});

								// Update Android when audio state changes
								['play', 'pause', 'timeupdate', 'seeking', 'seeked'].forEach(event => {
									audio.addEventListener(event, () => {
										updateAndroidPlaybackState();
									});
								});

								// Handle potential errors
								audio.addEventListener('error', (error) => {
									Debug.error('Audio error:', error);
									// Reset Android state
									if (window.Android && window.Android.updatePlaybackState) {
										window.Android.updatePlaybackState(false, 0);
									}
								});

								audio.addEventListener('loadedmetadata', updateMetadata);
								audio.addEventListener('durationchange', updateMetadata);
								
								['play', 'pause', 'timeupdate', 'seeking', 'seeked'].forEach(event => {
									audio.addEventListener(event, () => {
										updateAndroidPlaybackState();
										
										// Update media session position state with validation
										if ('setPositionState' in navigator.mediaSession) {
											const position = Math.min(Math.max(0, audio.currentTime || 0), audio.duration || 0);
											const duration = Math.max(position, audio.duration || 0);

											if (isFinite(duration) && isFinite(position)) {
												navigator.mediaSession.setPositionState({
													duration: duration,
													position: position,
													playbackRate: audio.playbackRate || 1.0
												});
											}
										}
									});
								});

								// Enhanced error handling
								audio.addEventListener('error', function(e) {
									Debug.error('Audio error occurred:', e.target.error);
									if (this.src.startsWith('blob:')) {
										URL.revokeObjectURL(this.src);
									}
									// Retry loading if it's a network error
									if (e.target.error.code === e.target.error.NETWORK_ERR) {
										setTimeout(() => loadAudio(), 1000);
									}
								});

								// Enhanced load audio with better retry logic
								const loadAudio = function(retryCount = 0) {
									if (!audio.currentSrc) {
										Debug.error('No audio source available');
										return;
									}

									const xhr = new XMLHttpRequest();
									xhr.open('GET', audio.currentSrc, true);
									xhr.responseType = 'blob';

									xhr.onprogress = function(e) {
										if (e.lengthComputable) {
											const percent = ((e.loaded / e.total) * 100).toFixed(2);
											Debug.log(`Loading progress: ${percent}%`);
											audio.dataset.loadingProgress = percent;
										}
									};

									xhr.onload = function() {
										if (xhr.status === 200) {
											Debug.log('XHR load successful');
											try {
												const blob = new Blob([xhr.response], { type });
												const url = URL.createObjectURL(blob);
												
												audio.src = url;
												audio.removeAttribute('data-loading');
												audio.removeAttribute('data-loading-progress');
												
												restorePlaybackPosition();
											} catch (error) {
												Debug.error('Error creating blob URL:', error);
											}
										} else {
											Debug.error('XHR load failed:', xhr.status);
											retryLoad(retryCount);
										}
									};

									xhr.onerror = function(error) {
										Debug.error('XHR error occurred:', error);
										retryLoad(retryCount);
									};

									xhr.send();
								};

								const retryLoad = (retryCount) => {
									if (retryCount < 3) {
										const delay = Math.pow(2, retryCount) * 1000;
										Debug.log(`Retrying load in ${delay}ms`);
										setTimeout(() => loadAudio(retryCount + 1), delay);
									}
								};

								const restorePlaybackPosition = () => {
									const currentTiddler = audio.closest('[data-tiddler-title]');
									if (currentTiddler) {
										const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
										const timestampField = getAudioTimestampField(audio);
										const savedTime = $tw.wiki.getTiddler(tiddlerTitle)
											?.fields[timestampField];
										if (savedTime) {
											Debug.log(`Restoring saved time: ${savedTime}`);
											audio.currentTime = parseFloat(savedTime);
										}
									}
								};

								loadAudio();
							}

=======
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
							// Playback position events
							audio.addEventListener('play', function () {
								Debug.log('Play event triggered');
								const currentTiddler = this.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
<<<<<<< HEAD
									const timestampField = getAudioTimestampField(this, tiddlerTitle);
									const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
									if (tiddler && tiddler.fields[timestampField]) {
										const savedTime = parseFloat(tiddler.fields[timestampField]);
										if (!isNaN(savedTime) && this.currentTime < 0.1) {
											Debug.log(`Restoring saved time: ${savedTime}`);
											this.currentTime = savedTime;
										}
=======
									const savedTime = $tw.wiki.getTiddler(tiddlerTitle)
										?.fields[getAudioTimestampField(this)];
									if (savedTime && this.currentTime < 0.1) {
										Debug.log(`Restoring saved time: ${savedTime}`);
										this.currentTime = parseFloat(savedTime);
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
									}
								}
							});

							audio.addEventListener('pause', function () {
<<<<<<< HEAD
								const currentTiddler = this.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									const timestampField = getAudioTimestampField(this, tiddlerTitle);

									$tw.wiki.setText(
										tiddlerTitle,
										timestampField,
										null,
										this.currentTime.toString()
									);
=======
								Debug.log('Pause event triggered');
								const currentTiddler = this.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									BatchedUpdates.queue(tiddlerTitle, {
										[getAudioTimestampField(this)]: this.currentTime.toString()
									});
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
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
<<<<<<< HEAD
										const sourceElement = this.querySelector('source');
										const audioSrc = sourceElement ?
											sourceElement.getAttribute('src') :
											this.getAttribute('src');

										// Find the source tiddler
										const sourceTiddler = Object.keys($tw.wiki.getTiddlers()).find(title => {
											const tiddler = $tw.wiki.getTiddler(title);
											return tiddler && tiddler.fields._canonical_uri === audioSrc;
										});

										if (sourceTiddler) {
											this.lastSavedTime = this.currentTime;
											this.lastUpdateTime = Date.now();

											const timestampField = `timecode-${sourceTiddler}.${tiddlerTitle}`;
											const updates = {};
											updates[timestampField] = this.currentTime.toString();

											// Use sourceTiddler instead of currentTiddler for the updates
											BatchedUpdates.queue(sourceTiddler, updates);
										}
=======
										this.lastSavedTime = this.currentTime;
										this.lastUpdateTime = Date.now();

										BatchedUpdates.queue(tiddlerTitle, {
											[getAudioTimestampField(this)]: this.currentTime.toString()
										});
>>>>>>> 52e492c107da81291cc8e2ecce5cde3b0ecb07b4
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