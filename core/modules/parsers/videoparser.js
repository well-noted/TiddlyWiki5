/*\
title: $:/core/modules/parsers/videoparser.js
type: application/javascript
module-type: parser

The video parser parses a video tiddler into an embeddable HTML element

\*/
(function () {

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	// Debug logging helper
	const debugLog = (category, message, data = {}) => {
		console.log(`[VideoParser:${category}]`, message, data);
	};

	// Add helper function at top
	function getVideoTimestampField(video) {
		const sourceElement = video.querySelector('source');
		let originalSrc = sourceElement ? sourceElement.getAttribute('src') : video.getAttribute('src');
		if (originalSrc.startsWith('data:')) {
			originalSrc = originalSrc.substring(originalSrc.indexOf('base64,') + 7);
		}
		let hash = 0;
		for (let i = 0; i < originalSrc.length; i++) {
			hash = ((hash << 5) - hash) + originalSrc.charCodeAt(i);
			hash = hash & hash;
		}
		return `video-timestamp-${Math.abs(hash)}`;
	}

	// Add performance monitoring and cache management
	const MEMORY_LIMIT = 100 * 1024 * 1024; // 100MB limit
	const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
	const BUFFER_AHEAD = 3; 

	class ChunkCache {
		constructor() {
			this.chunks = new Map();
			this.totalSize = 0;
			this.lastAccessed = new Map();
		}

		has(key) {
			return this.chunks.has(key);
		}

		set(key, value) {
			const size = value.byteLength;
			while (this.totalSize + size > MEMORY_LIMIT && this.chunks.size > 0) {
				const oldest = [...this.lastAccessed.entries()]
					.sort((a, b) => a[1] - b[1])[0][0];
				this.delete(oldest);
			}
			this.chunks.set(key, value);
			this.lastAccessed.set(key, Date.now());
			this.totalSize += size;
		}

		get(key) {
			if (this.has(key)) {
				this.lastAccessed.set(key, Date.now());
				return this.chunks.get(key);
			}
			return null;
		}

		delete(key) {
			const chunk = this.chunks.get(key);
			if (chunk) {
				this.totalSize -= chunk.byteLength;
				this.chunks.delete(key);
				this.lastAccessed.delete(key);
			}
		}
	}

	const chunkCache = new ChunkCache();

	// Add constants for streaming
	const MIN_BUFFER_SIZE = 2; // 2 seconds minimum buffer
	const INITIAL_SEGMENT_DURATION = 4; // 4 second segments
	const QUALITY_LEVELS = [
		{width: 1920, height: 1080, bitrate: 5000000},
		{width: 1280, height: 720, bitrate: 2500000},
		{width: 854, height: 480, bitrate: 1000000},
		{width: 640, height: 360, bitrate: 500000}
	];

	var VideoParser = function (type, text, options) {
		var element = {
			type: "element",
			tag: "video",
			attributes: {
				controls: { type: "string", value: "controls" },
				style: { type: "string", value: "width: 100%; object-fit: contain" },
				preload: { type: "string", value: "auto" },
				class: { type: "string", value: "tw-video-element" }
			}
		};

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
			const processedVideos = new WeakMap();
			const bufferThreshold = 0.1; // 10% buffered before play

			$tw.hooks.addHook("th-page-refreshed", function () {
				setTimeout(function () {
					Array.from(document.getElementsByClassName("tw-video-element")).forEach(function (video) {
						if (!video.dataset.initialized) {
							video.dataset.initialized = "true";

							// Only add timestamp listeners after video is buffered and ready
							video.addEventListener('canplay', function () {
								// Restore timestamp
								const currentTiddler = video.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									const savedTime = $tw.wiki.getTiddler(tiddlerTitle)?.fields[getVideoTimestampField(video)];
									if (savedTime) video.currentTime = parseFloat(savedTime);
								}

								// Add timestamp saving on pause
								video.addEventListener('pause', function () {
									const currentTiddler = video.closest('[data-tiddler-title]');
									if (currentTiddler) {
										const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
										const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
										if (tiddler) {
											$tw.wiki.addTiddler(
												new $tw.Tiddler(tiddler, {
													[getVideoTimestampField(video)]: video.currentTime.toString()
												}),
												{ suppressUpdate: true, quiet: true }
											);
										}
									}
								});
							}, { once: true });

							// Continue with existing buffering code
							if (processedVideos.has(video)) return;

							// Create loading overlay
							const overlay = document.createElement('div');
							overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:white;';
							overlay.innerHTML = 'Loading 0%';
							video.parentNode.style.position = 'relative';
							video.parentNode.appendChild(overlay);

							video.preload = "auto";
							video.autobuffer = true;

							// Prevent play until buffered
							video.addEventListener('play', function (e) {
								if (video.buffered.length === 0 || (video.buffered.end(0) / video.duration) < bufferThreshold) {
									console.log('Waiting for buffer...');
									video.pause();
								}
							}, { passive: true });

							// Monitor buffering
							video.addEventListener('progress', function () {
								if (video.buffered.length > 0) {
									const progress = (video.buffered.end(0) / video.duration * 100).toFixed(2);
									console.log(`Buffer: ${progress}%`);
									
									// Adaptive buffer threshold
									const networkSpeed = navigator.connection?.downlink || 10;
									const adaptiveThreshold = Math.max(0.1, Math.min(0.3, 1 / networkSpeed));
									
									if ((video.buffered.end(0) / video.duration) >= adaptiveThreshold) {
										overlay.style.display = 'none';
									}
									
									// Preload next chunks
									const currentTime = video.currentTime;
									const chunksNeeded = Math.ceil((currentTime + 30) / CHUNK_SIZE); // 30s ahead
									loadChunks(video.currentSrc, chunksNeeded);
								}
							}, { passive: true });

							const xhr = new XMLHttpRequest();
							xhr.open('GET', video.currentSrc, true);
							xhr.responseType = 'blob';

							// Add range support
							xhr.setRequestHeader('Range', 'bytes=0-');
							xhr.setRequestHeader('Cache-Control', 'no-cache');
							xhr.setRequestHeader('Pragma', 'no-cache');

							if ('connection' in navigator) {
								const connectionSpeed = navigator.connection?.downlink || 10;
								const initialChunkSize = Math.min(CHUNK_SIZE, connectionSpeed * 1024 * 100);
								xhr.setRequestHeader('Range', `bytes=0-${initialChunkSize}`);
							}

							// Improved progress tracking
							xhr.onprogress = function (e) {
								if (e.lengthComputable) {
									const progress = (e.loaded / e.total * 100).toFixed(2);
									console.log(`Download: ${progress}%`);
									
									if (overlay) {
										overlay.innerHTML = `Loading ${progress}%`;
										if (progress > (bufferThreshold * 100)) {
											overlay.style.display = 'none';
										}
									}
								}
							};

							xhr.onload = function () {
								if (xhr.status === 200 || xhr.status === 206) {
									const blob = new Blob([xhr.response], { type: video.type || 'video/mp4' });
									const url = URL.createObjectURL(blob);
									video._blob = blob;
									video.src = url;
									processedVideos.set(video, {
										blob: blob,
										url: url
									});

									// Add timestamp restoration after buffering
									video.addEventListener('canplaythrough', function() {
										const currentTiddler = video.closest('[data-tiddler-title]');
										if (currentTiddler) {
											const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
											const savedTime = $tw.wiki.getTiddler(tiddlerTitle)?.fields[getVideoTimestampField(video)];
											if (savedTime) {
												video.currentTime = parseFloat(savedTime);
											}
										}
									}, { once: true });

									// Handle seeking with passive listener
									video.addEventListener('seeking', function () {
										if (!video.src || video.src === '') {
											video.src = URL.createObjectURL(video._blob);
										}
									}, { passive: true });

									// Cleanup
									const observer = new MutationObserver(function (mutations) {
										mutations.forEach(function (mutation) {
											if ([...mutation.removedNodes].includes(video)) {
												URL.revokeObjectURL(url);
												processedVideos.delete(video);
												observer.disconnect();
												if (overlay.parentNode) {
													overlay.parentNode.removeChild(overlay);
												}
											}
										});
									});

									observer.observe(video.parentNode, {
										childList: true,
										subtree: true
									});
								}
							};

							xhr.send();

							video.addEventListener('loadedmetadata', async () => {
								requestAnimationFrame(async () => {
									const xhr = new XMLHttpRequest();
									// Encode the URL to handle spaces and special characters
									const encodedUrl = encodeURI(video.currentSrc);
									xhr.open('HEAD', encodedUrl);

									xhr.onload = () => {
										const observer = new MutationObserver((mutations) => {
											requestAnimationFrame(() => {
												mutations.forEach((mutation) => {
													if (mutation.addedNodes.length) {
														const overlay = mutation.target.querySelector('.play-overlay');
														if (overlay) {
															overlay.parentNode.removeChild(overlay);
														}
													}
												});
											});
										});

										observer.observe(video.parentNode, {
											childList: true,
											subtree: true
										});
									};

									xhr.send();
								});
							}, { passive: true });

							// Add to VideoParser initialization
							const metrics = {
								bufferCount: 0,
								droppedFrames: 0,
								loadTime: 0
							};

							video.addEventListener('progress', function() {
								const {isBuffered, bufferEnd} = getBufferState(video);
								if (isBuffered) {
									// Dynamic chunk size based on network conditions
									const networkSpeed = navigator.connection?.downlink || 10;
									const dynamicChunkSize = Math.min(
										CHUNK_SIZE * 2,
										Math.max(CHUNK_SIZE / 2, networkSpeed * 100 * 1024)
									);

									// Predictive loading based on playback patterns
									const currentChunk = Math.floor(video.currentTime / (dynamicChunkSize / 1024 / 1024));
									const playbackRate = video.playbackRate;
									const predictedChunks = Math.ceil(playbackRate * BUFFER_AHEAD);

									loadChunks(video.currentSrc, currentChunk + predictedChunks, dynamicChunkSize);
									
									// Track performance
									metrics.bufferCount++;
									requestAnimationFrame(() => {
										if (video.getVideoPlaybackQuality) {
											metrics.droppedFrames = video.getVideoPlaybackQuality().droppedVideoFrames;
										}
									});
								}
							}, { passive: true });

							// Add debug logging
							video.addEventListener('progress', function() {
								const {isBuffered, bufferEnd} = getBufferState(video);
								if (isBuffered) {
									// Network monitoring
									const networkSpeed = navigator.connection?.downlink || 10;
									debugLog('Network', `Speed detected: ${networkSpeed}Mbps`);

									// Chunk calculations
									const dynamicChunkSize = Math.min(
										CHUNK_SIZE * 2,
										Math.max(CHUNK_SIZE / 2, networkSpeed * 100 * 1024)
									);
									debugLog('Chunks', `Dynamic chunk size: ${(dynamicChunkSize/1024/1024).toFixed(2)}MB`, {
										networkSpeed,
										baseSize: CHUNK_SIZE/1024/1024
									});

									// Buffer state
									debugLog('Buffer', `Current state`, {
										bufferEnd,
										duration: video.duration,
										percentage: ((bufferEnd / video.duration) * 100).toFixed(2) + '%'
									});

									// Memory tracking
									if (performance.memory) {
										debugLog('Memory', `Usage stats`, {
											heapSize: (performance.memory.usedJSHeapSize/1024/1024).toFixed(2) + 'MB',
											cacheSize: (chunkCache.totalSize/1024/1024).toFixed(2) + 'MB'
										});
									}

									// Quality metrics
									debugLog('Performance', `Playback metrics`, {
										bufferCount: metrics.bufferCount,
										droppedFrames: metrics.droppedFrames,
										loadTime: metrics.loadTime
									});
								}
							}, { passive: true });

							// Monitor memory usage
							setInterval(() => {
								if (performance.memory) {
									const memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024;
									if (memoryUsage > 90) {
										chunkCache.chunks.clear();
										chunkCache.totalSize = 0;
										chunkCache.lastAccessed.clear();
									}
								}
							}, 30000);

							// Enable streaming if supported
							if ('MediaSource' in window && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"')) {
								const mediaSource = new MediaSource();
								video.src = URL.createObjectURL(mediaSource);
						
								mediaSource.addEventListener('sourceopen', () => {
									const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
									
									// Start with lowest quality for quick start
									const networkSpeed = navigator.connection?.downlink || 1;
									let currentQuality = QUALITY_LEVELS.findIndex(q => q.bitrate <= networkSpeed * 1000000) || QUALITY_LEVELS.length - 1;
						
									// Load initial segment
									loadSegment(0, INITIAL_SEGMENT_DURATION, currentQuality);
						
									video.addEventListener('timeupdate', () => {
										const buffered = video.buffered;
										const currentTime = video.currentTime;
										
										// Safely check buffer state
										if (buffered && buffered.length > 0) {
											const bufferEnd = buffered.end(buffered.length - 1);
											const bufferStart = buffered.start(buffered.length - 1);
											
											// Check if we need more buffer
											if (bufferEnd - currentTime < MIN_BUFFER_SIZE) {
												loadSegment(currentTime, INITIAL_SEGMENT_DURATION, currentQuality);
											}

											// Adapt quality based on buffer state
											const bufferHealth = bufferEnd - currentTime;
											if (bufferHealth < MIN_BUFFER_SIZE && currentQuality < QUALITY_LEVELS.length - 1) {
												currentQuality++;
											} else if (bufferHealth > MIN_BUFFER_SIZE * 2 && currentQuality > 0) {
												currentQuality--;
											}
										}
									});
						
									async function loadSegment(startTime, duration, qualityIndex) {
										const quality = QUALITY_LEVELS[qualityIndex];
										const segment = await fetchVideoSegment(video.currentSrc, startTime, duration, quality);
										sourceBuffer.appendBuffer(segment);
									}
								});
							} else {
								// Fallback to basic loading for unsupported browsers
								video.preload = "metadata";
								video.addEventListener('canplay', () => {
									video.play();
								});
							}
						}
					});
				}, 100);
			}, { passive: true });
		}

		this.tree = [element];
		this.type = type;
	};

	// Optimized chunk loading
	async function loadChunks(src, endChunk, dynamicChunkSize = CHUNK_SIZE) {
		try {
			debugLog('Chunks', `Loading chunks up to ${endChunk}`);
			for (let i = 0; i < endChunk; i++) {
				const chunkKey = `${src}-${i}`;
				if (!chunkCache.has(chunkKey)) {
					const start = i * dynamicChunkSize;
					const end = start + dynamicChunkSize;
					
					const response = await fetch(src, {
						headers: { 'Range': `bytes=${start}-${end}` }
					});
					
					if (response.ok) {
						const chunk = await response.arrayBuffer();
						chunkCache.set(chunkKey, chunk);
						debugLog('Chunks', `Loaded chunk ${i}`, { size: chunk.byteLength });
					}
				}
			}
		} catch (error) {
			debugLog('Error', `Failed to load chunks: ${error.message}`);
		}
	}

	// Add safe buffer check helper
	function getBufferState(video) {
		const buffered = video.buffered;
		if (!buffered || buffered.length === 0) {
			return {
				bufferEnd: 0,
				bufferStart: 0,
				isBuffered: false
			};
		}
		
		return {
			bufferEnd: buffered.end(buffered.length - 1),
			bufferStart: buffered.start(buffered.length - 1),
			isBuffered: true
		};
	}

	exports["video/ogg"] = VideoParser;
	exports["video/webm"] = VideoParser;
	exports["video/mp4"] = VideoParser;
	exports["video/quicktime"] = VideoParser;

})();
