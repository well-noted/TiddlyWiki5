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
			const TIMESTAMP_THRESHOLD = 2;

			$tw.hooks.addHook("th-page-refreshed", function () {
				setTimeout(function () {
					Array.from(document.getElementsByClassName("tw-video-element")).forEach(function (video) {
						if (!video.dataset.initialized) {
							video.dataset.initialized = "true";
							debugLog('Init', 'Initializing video player');

							let lastSavedTime = 0;
							let lastSaveTimestamp = 0;
							let isInitializing = true;

							function saveTimestamp() {
								if (isInitializing) return;
								
								const currentTiddler = video.closest('[data-tiddler-title]');
								if (currentTiddler) {
									const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
									const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
									if (tiddler) {
										const currentTime = video.currentTime;
										if (Math.abs(currentTime - lastSavedTime) >= TIMESTAMP_THRESHOLD) {
											lastSavedTime = currentTime;
											lastSaveTimestamp = Date.now();
											$tw.wiki.addTiddler(new $tw.Tiddler(
												tiddler,
												{[getVideoTimestampField(video)]: currentTime.toString()}
											));
											debugLog('Timestamp', `Saved position: ${currentTime}s`);
										}
									}
								}
							}

							// Create loading overlay
							const overlay = document.createElement('div');
							overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:white;';
							overlay.innerHTML = 'Loading 0%';
							video.parentNode.style.position = 'relative';
							video.parentNode.appendChild(overlay);

							// Basic XHR request
							const xhr = new XMLHttpRequest();
							xhr.open('GET', video.currentSrc);
							xhr.responseType = 'blob';

							xhr.onprogress = function(e) {
								if (e.lengthComputable) {
									const progress = (e.loaded / e.total * 100).toFixed(2);
									debugLog('Progress', `Loading: ${progress}%`);
									overlay.innerHTML = `Loading ${progress}%`;
									if (progress >= (bufferThreshold * 100)) {
										overlay.style.display = 'none';
									}
								}
							};

							xhr.onload = function() {
								if (xhr.status === 200) {
									const blob = new Blob([xhr.response], { type: video.type || 'video/mp4' });
									const url = URL.createObjectURL(blob);
									video.src = url;
									debugLog('Load', 'Video data received');
									
									// Add timestamp restoration
									video.addEventListener('loadedmetadata', function() {
										debugLog('Metadata', 'Video metadata loaded');
										const currentTiddler = video.closest('[data-tiddler-title]');
										if (currentTiddler) {
											const tiddlerTitle = currentTiddler.getAttribute('data-tiddler-title');
											const savedTime = $tw.wiki.getTiddler(tiddlerTitle)?.fields[getVideoTimestampField(video)];
											if (savedTime) {
												video.currentTime = parseFloat(savedTime);
												lastSavedTime = parseFloat(savedTime);
												debugLog('Timestamp', `Restored position: ${savedTime}s`);
											}
										}
										isInitializing = false;
										overlay.style.display = 'none';
									}, {once: true});

									video.addEventListener('pause', saveTimestamp);
									video.addEventListener('seeked', saveTimestamp);
									
									video.addEventListener('timeupdate', function() {
										if (!isInitializing && Date.now() - lastSaveTimestamp > 1000) {
											saveTimestamp();
										}
									});
								} else {
									debugLog('Error', `Failed to load video: HTTP ${xhr.status}`);
									overlay.innerHTML = 'Error loading video';
								}
							};

							xhr.onerror = function() {
								debugLog('Error', `Network error loading video`);
								overlay.innerHTML = 'Error loading video';
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

	// Add fetch video segment function
	async function fetchVideoSegment(src, startTime, duration, quality) {
		const start = Math.floor(startTime * quality.bitrate / 8);
		const end = Math.floor((startTime + duration) * quality.bitrate / 8);
		
		try {
			const response = await fetch(src, {
				headers: {
					Range: `bytes=${start}-${end}`
				}
			});
			
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			return await response.arrayBuffer();
		} catch (error) {
			debugLog('Error', `Failed to fetch segment: ${error.message}`);
			throw error;
		}
	}

	exports["video/ogg"] = VideoParser;
	exports["video/webm"] = VideoParser;
	exports["video/mp4"] = VideoParser;
	exports["video/quicktime"] = VideoParser;

})();
