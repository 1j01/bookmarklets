function find_edit_points(code) {
	var doc = [];
	var edits = [];

	// the first group here is in lieu of negative lookbehinds in javascript,
	// to avoid starting matching from inside an identifier
	// (the last group `(?!e)` is because we don't handle exponents currently)
	var numbers_regexp = /([^a-z0-9$_]|^)(0x[\dA-F]+|\d+(?:\.\d*)?|\.\d+)(?!e)/gi;
	var match;
	var last_match_lastIndex = 0;
	while ((match = numbers_regexp.exec(code)) !== null) {
		var [match_str, negative_match_group_str, num_str] = match;
		doc.push(code.slice(last_match_lastIndex, match.index + negative_match_group_str.length));
		if (isNaN(num_str)) {
			console.warn(`somehow matched ${num_str} (full match_str = ${match_str})`);
			doc.push(edit);
		} else {
			var edit = {
				type: "number_literal",
				original_str: num_str,
				mutation_str: num_str,
			};
			edits.push(edit);
			doc.push(edit);
		}
		last_match_lastIndex = numbers_regexp.lastIndex;
	}
	doc.push(code.slice(last_match_lastIndex));

	return {doc, edits};
}
function find_edit_points_skipping_line_comments(code) {
	// TODO: loosely ignore block comments too
	// (ignoring the complexity of things in strings, like `"// /* /*/"`, or `var rgx = /http:\/\/foo\/*/i`)

	var doc = [];
	var edits = [];

	code.split("\n").forEach((line)=> {
		if (line.match(/^\s*\/\//)) {
			doc.push(line);
		} else {
			var line_stuff = find_edit_points(line);
			doc = doc.concat(line_stuff.doc);
			edits = edits.concat(line_stuff.edits);
		}
		doc.push("\n");
	});

	return {doc, edits};
}

function mutate_number_literal(num_str, mutation_chance) {
	var n = parseFloat(num_str);
	var original_n = n;

	// keep number as float or int (determined by whether there's a decimal point in GLSL)
	var had_dot = num_str.indexOf(".") > -1;
	var keep_as_int_or_float = (n)=> {
		if (had_dot && `${n}`.indexOf(".") === -1) {
			return `${n}.0`;
		} else if (!had_dot) {
			return `${Math.ceil(n)}`;
		}
		return `${n}`;
	}

	if (Math.random() < mutation_chance) { n += 1; }
	if (Math.random() < mutation_chance) { n -= 1; }
	if (Math.random() < mutation_chance) { n /= 2; }
	if (Math.random() < mutation_chance) { n *= 2; }
	if (isNaN(n)) {
		console.warn(`somehow got ${n} from ${JSON.stringify(num_str)}`);
		return num_str;
	} else if (n < 0 && original_n >= 0) {
		return `(${keep_as_int_or_float(n)})`;
	}
	return keep_as_int_or_float(n);
}

function render_doc_to_string(doc, edits_to_include) {
	return doc.map((part)=> {
		if (typeof part === "string") {
			return part;
		} else if (edits_to_include.includes(part)) {
			return part.mutation_str;
		} else {
			return part.original_str;
		}
	}).join("");
}

function get_code_from_page() {
	//var textarea = document.querySelector("#code");
	//var original_code = textarea.value;
	var cm = document.querySelector('.CodeMirror').CodeMirror;
	return cm.getValue();
}
function set_code_on_page(new_code) {
	// TODO for bytebeat: would seem to need to be async
	//textarea.focus();
	//setTimeout(function(){
		//textarea.select();
		//document.execCommand("InsertText", false, new_code);
	//});
	var cm = document.querySelector('.CodeMirror').CodeMirror;
	cm.setValue(new_code);
}

function find_problem_in_output_on_page() {
	// TODO: bytebeat
	var error_message_el = document.querySelector(".CodeMirror-linewidget .errorMessage");
	if (error_message_el && getComputedStyle(error_message_el).visibility !== "hidden") {
		return new Error(`compile failed: ${error_message_el.textContent}`);
	}
	if (document.querySelector(".tab.errorYes")) {
		return new Error("compile failed (in some tab)");
	}
	// TODO: maybe testing the canvas for whether it's blank (after rendering a frame) is be expensive enough
	// that it should first do a pass just checking that it compiles, and check *at the end* if it's blank,
	// and if it's blank then start over but checking also for blankness every time
	if (!is_output_canvas_interesting()) {
		return new Error("output looks boring / blank");
	}
}

var output_canvas = document.querySelector("canvas#demogl, canvas.playerCanvas, #player canvas, #content canvas, canvas");

var test_canvas = document.createElement("canvas");
var test_ctx = test_canvas.getContext("2d");
test_canvas.width = 10;
test_canvas.height = 10;

var thumbnail_canvas = document.createElement("canvas");
var thumbnail_ctx = thumbnail_canvas.getContext("2d");
thumbnail_canvas.width = 200;
thumbnail_canvas.height = thumbnail_canvas.width * output_canvas.height / output_canvas.width;

var existing_style = document.querySelector("#mutagen-style");
if (existing_style) {
	existing_style.remove();
}
var css = `
#mutagen-thumbnails-container {
	position: absolute;
	right: 0;
	bottom: 0;
	width: 100%;
	height: 50%;
	z-index: 10;
	background: rgba(0, 0, 0, 0.5);
	transform: scale(0.2);
	transform-origin: bottom right;
	transition: transform .2s ease;
	overflow: auto;

	display: grid;
	grid-template-columns: repeat(auto-fill, ${thumbnail_canvas.width}px);
	grid-gap: 10px;
	justify-content: center;
	align-content: flex-start;
	margin: 0 auto;
	padding-top: 15px;
	padding-bottom: 15px; /* doesn't seem to work - could use margin instead tho if there's an outer container */
}
#mutagen-thumbnails-container:hover,
#mutagen-thumbnails-container:focus-within {
	transform: scale(1);
}
.mutagen-thumbnail {
	cursor: pointer;
	vertical-align: top;
}
`;
var style = document.createElement("style");
style.id = "mutagen-style";
document.head.appendChild(style);
style.type = "text/css";
style.appendChild(document.createTextNode(css));


var thumbnails = Array.from(document.querySelectorAll(".mutagen-thumbnail"));
var existing_thumbnails_container = document.querySelector("#mutagen-thumbnails-container"); // history palette / specimen palette
if (existing_thumbnails_container) {
	existing_thumbnails_container.remove();
}
var thumbnails_container = document.createElement("div");
thumbnails_container.id = "mutagen-thumbnails-container";
document.body.appendChild(thumbnails_container);
for (var thumbnail of thumbnails) {
	thumbnails_container.appendChild(thumbnail);
}
thumbnails_container.addEventListener("click", (event)=> {
	if (!event.target.classList.contains("mutagen-thumbnail")) {
		return;
	}
	var thumbnail_img = event.target;
	try {
		window.mutagen_stop();
	} catch(e) {}
	set_code_on_page(thumbnail_img.dataset.code);
	compile_code_on_page();
});
thumbnails_container.addEventListener("dblclick", (event)=> {
	if (!event.target.classList.contains("mutagen-thumbnail")) {
		return;
	}
	var thumbnail_img = event.target;
	try {
		window.mutagen_stop();
	} catch(e) {}
	set_code_on_page(thumbnail_img.dataset.code);
	mutate_code_on_page();
});

function record_thumbnail() {
	var code = get_code_from_page();
	if (thumbnails.some((el)=> el.dataset.code === code)) {
		return;
	}

	var thumbnail_img = document.createElement("img");
	thumbnail_img.className = "mutagen-thumbnail";
	thumbnail_ctx.clearRect(0, 0, thumbnail_canvas.width, thumbnail_canvas.height);
	thumbnail_ctx.drawImage(output_canvas, 0, 0, thumbnail_canvas.width, thumbnail_canvas.height);
	thumbnail_img.src = thumbnail_canvas.toDataURL();
	thumbnail_img.width = thumbnail_canvas.width;
	thumbnail_img.height = thumbnail_canvas.height;
	thumbnail_img.dataset.code = code;
	thumbnail_img.tabIndex = 0;
	thumbnail_img.setAttribute("role", "button");
	thumbnails_container.appendChild(thumbnail_img);
}

function is_output_canvas_interesting() {
	test_ctx.clearRect(0, 0, test_canvas.width, test_canvas.height);
	test_ctx.drawImage(output_canvas, 0, 0, test_canvas.width, test_canvas.height);

	var image_data = test_ctx.getImageData(0, 0, test_canvas.width, test_canvas.height);
	var {data} = image_data;

	// TODO: test for maybe 40% of any of four sides being blank
	// and actually give a scalar fitness rating
	// TODO: make it more perceptual in the color difference, i.e. treating similar brightnesses more similarly
	// and maybe don't look at the very edges because just a vignette isn't very interesting
	var [r, g, b] = data;
	var threshold = 25;
	var interesting = false;
	for (var i=0; i<data.length; i+=4) {
		var diff =
			Math.abs(data[i+0] - r) +
			Math.abs(data[i+1] - g) +
			Math.abs(data[i+2] - b);
		if (diff > threshold) {
			interesting = true;
		}
	}
	return interesting;
}

function is_compiling() {
	// TODO: bytebeat
	return document.querySelector("#compilationTime").textContent.match(/Compiling/i);
}
function compile_code_on_page() {
	//compile(new_code); // bytebeat
	document.querySelector("[title~='Compile']").click(); // shadertoy

	return new Promise((resolve, reject)=> {
		function wait_for_compile_end() {
			if (is_compiling()) {
				setTimeout(wait_for_compile_end, 50);
			} else {
				setTimeout(()=> { // may not be needed!
					var error = find_problem_in_output_on_page();
					if (error) { reject(error); } else { resolve(); }
				}, 5);
			}
		}
		wait_for_compile_end();
	});
}
function generate_mutations(edits) {
	var mutation_chance = 0.01 + (0.5 / edits.length);
	var min_edits = 5;
	var max_tries_to_reach_min_edits = 50;
	var tries_to_reach_min_edits = 0;
	var num_edits;
	do {
		for (var edit of edits) {
			if (edit.type === "number_literal") {
				edit.mutation_str = mutate_number_literal(edit.original_str, mutation_chance);
			}
		}
		num_edits = edits.reduce((acc, edit)=> {
			return acc + (edit.original_str !== edit.mutation_str);
		}, 0);
		tries_to_reach_min_edits++;
		mutation_chance *= 1.5;
		// console.log(`${num_edits} possible edits`);
	} while (tries_to_reach_min_edits < max_tries_to_reach_min_edits && num_edits < min_edits);
	// console.log(`${num_edits} possible edits in ${tries_to_reach_min_edits} tries`);
}

var choose = (array)=> array[~~(array.length * Math.random())];

var logo_canvas = document.createElement("canvas");
var logo_ctx = logo_canvas.getContext("2d");
logo_canvas.width = 100;
logo_canvas.height = 10;

// for debug
var existing_logo_canvas = document.getElementById("mutagen-logo-canvas-debug");
if (existing_logo_canvas) { existing_logo_canvas.remove(); }
if (window.mutagen_debug_logo) {
	logo_canvas.id = "mutagen-logo-canvas-debug";
	document.body.appendChild(logo_canvas);
	logo_canvas.style.position = "absolute";
	logo_canvas.style.left = "0";
	logo_canvas.style.top = "0";
	logo_canvas.style.transform = "scale(10)";
	logo_canvas.style.transformOrigin = "top left";
	logo_canvas.style.imageRendering = "crisp-edges";
	logo_canvas.style.imageRendering = "pixelated";
	logo_canvas.style.background = "rgba(0, 0, 0, 1)";
}

function draw_logo() {
	logo_ctx.clearRect(0, 0, logo_canvas.width, logo_canvas.height);
	// logo_ctx.fillRect(0, 0, 5, 5);
	logo_ctx.save();
	logo_ctx.scale(logo_canvas.height, logo_canvas.height);
	logo_ctx.translate(0.5, 0.5);
	logo_ctx.scale(0.7, 0.7);
	logo_ctx.translate(-0.5, -0.5);
	var letter_spacing = 0.5;
	var m_slantedness = Math.random() * 0.8;
	var m_width = 1.4 + m_slantedness * 0.8;
	var a_roundedness = 1 - Math.random() * 0.6;
	var letter_data = [
		{
			letter: "M",
			points: [
				[0, 1],
				[0.25 * m_slantedness * m_width, 0],
				[0.5 * m_width, 1 - Math.random() * 0.25],
				[(1 - 0.25 * m_slantedness) * m_width, 0],
				[1 * m_width, 1],
			],
			width: m_width,
			kern_after: -m_slantedness * 0.2,
		},
		{
			letter: "U",
			points: [
				[0, 0],
				[0, 0.5],
				[0.2, 0.8],
				[0.5, 1],
				[0.8, 0.8],
				[1, 0.5],
				[1, 0],
			],
			kern_after: -0.15,
		},
		{
			letter: "T",
			points: [
				[0, 0],
				[1, 0],
				[0.5, 0],
				[0.5, 1],
			],
			kern_after: -0.3,
		},
		{
			letter: "A",
			points: [
				[0, 1],
					[0.25, 0.5 - a_roundedness * 0.8],
						[0.5, 0],
					[0.75, 0.5 - a_roundedness * 0.8],
				[1, 1],

				[0.9, 0.75 - a_roundedness * 0.2],
				[0.2, 0.75 - a_roundedness * 0.2],
			],
			kern_after: -0.15,
		},
		{
			letter: "G",
			points: [
				[0.9, 0.01],
				[0.5, 0],
				[0.4, 0.1],
				[0.2, 0.4],
				[0, 0.5],
				[0.2, 0.7],
				[0.5, 1],
				[0.7, 0.9],
				[1, 0.7],
				[1, 0.5],
				[0.6, 0.5],
			],
		},
		{
			letter: "E",
			points: [
				[1, 0],
				[0, 0],
				[0, 0.5],
				[0.7, 0.5],
				[0, 0.5],
				[0, 1],
				[1, 1],
			],
		},
		{
			letter: "N",
			points: [
				[0, 1],
				[0, 0],
				[1, 1],
				[1, 0],
			],
		},
	];
	var rand = Math.random();
	var rand2 = Math.random();
	var lw_inc = 0;
	for (var letter of letter_data) {
		var {points, width, kern_after} = letter;
		width = width || 1;
		kern_after = kern_after || 0;
		var letter_width_scale = 1 + Math.random() * 0.4;
		var letter_width = width * letter_width_scale;
		logo_ctx.save();
		logo_ctx.scale(letter_width_scale, 1);
		// TODO: increase letter spacing around rotated letters
		var rotation = (Math.random() - 1/2) * 0.2;
		logo_ctx.rotate(rotation);
		for (var i=0; i<points.length-1; i++) {
			var a = points[i];
			var b = points[i+1];
			a.x += Math.random() * 0.05;
			a.y += Math.random() * 0.05;
			b.x += Math.random() * 0.05;
			b.y += Math.random() * 0.05;
			logo_ctx.beginPath();
			logo_ctx.moveTo(a[0], a[1]);
			logo_ctx.lineTo(b[0], b[1]);
			lw_inc += Math.random();
			logo_ctx.lineWidth = 0.04 + Math.max(0, 0.1 * Math.sin(lw_inc / 5 * rand2 + rand * 5) * Math.sin(lw_inc / 50 + rand*19));
			logo_ctx.strokeStyle = "white";
			logo_ctx.stroke();
		}
		logo_ctx.restore();
		logo_ctx.translate(letter_width + letter_spacing + kern_after, 0);
	}
	logo_ctx.restore();

	var chars = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█"; // semantically pure, but not monospace
	// var chars = "▁▘▝▛▖▛▞▛▗▚▜▜▅▙▟▇"; // actually monospace, but wider than a space
	// var chars = " ▀▄▌▐█"; // good monospace, normal-space-sized characters
	var ch_top = "▀";
	var ch_bottom = "▄";
	var ch_left = "▌";
	var ch_right = "▐";
	var ch_full = "█";

	var image_data = logo_ctx.getImageData(0, 0, logo_canvas.width, logo_canvas.height);
	var at = (x, y)=>
		(image_data.data[
			((y * image_data.width) + x) * 4 + 3
		] / 256) > 0.1;
	console.assert(logo_canvas.width % 2 === 0, "we're assuming an even number of pixels for accessing image data");
	console.assert(logo_canvas.height % 2 === 0, "we're assuming an even number of pixels for accessing image data");

	var logo = "";
	for (var y=0; y<logo_canvas.height; y+=2) {
		for (var x=0; x<logo_canvas.width; x+=2) {
			var upper_left = at(x, y);
			var upper_right = at(x+1, y);
			var lower_left = at(x, y+1);
			var lower_right = at(x+1, y+1);
			logo += chars[0 + upper_left + upper_right*2 + lower_left*4 + lower_right*8];
		}
		logo += "\n";
	}
	logo = logo
		.replace(/▘/g, ()=> choose([ch_left, ch_top]))
		.replace(/▝/g, ()=> choose([ch_right, ch_top]))
		.replace(/▗/g, ()=> choose([ch_right, ch_bottom]))
		.replace(/▖/g, ()=> choose([ch_left, ch_bottom]))
		.replace(/[▛▜▟▙▚▞]/g, ch_full);

	// add some particles...
	// this is a silly way of doing this, but hey, it works!
	var n_lines = logo.split("\n").length;
	var line_length = logo.split("\n")[0].length + 1; // 1 for \n
	logo.replace(/\S/g, (match, offset)=> {
		if (Math.random() < 0.5) {
			var x = offset % line_length;
			var y = Math.floor(offset / line_length);
			var particle_char = choose("·.•▪");
			x += choose([-2, -1, -1, 0, 1, 1, 2]);
			y += choose([-2, -1, -1, 0, 1, 1, 2]);
			if (x >= 0 && y >= 0 && x < line_length && y < n_lines) {
				var new_offset = (line_length * y) + x;
				if (logo[new_offset] === " ") {
					logo = logo.slice(0, new_offset) + particle_char + logo.slice(new_offset + 1);
				}
			}
		}
	});

	return logo;
}

var attribution_header_start = `// Based on `;
var attribution_header_end = `code mutation tool by Isaiah Odhner)`;

function get_attribution_header() {
	// TODO: handle shaders being edited (don't say "Based on" I suppose? get name title from input)
	var shader_title = document.querySelector("#shaderTitle").textContent;
	var shader_author_name = document.querySelector("#shaderAuthorName").textContent;
	var shader_author_date = document.querySelector("#shaderAuthorDate").textContent;
	var shader_author_year = shader_author_date.replace(/-.*/, "");

// 	var logo = `
// • ▌ ▄ ·. ▄• ▄▌▄▄▄▄▄ ▄▄▄·  ▄▄ • ▄▄▄ . ▐ ▄ 
// ·██ ▐███▪█▪██▌•██  ▐█ ▀█ ▐█ ▀ ▪▀▄.▀·•█▌▐█
// ▐█ ▌▐▌▐█·█▌▐█▌ ▐█.▪▄█▀▀█ ▄█ ▀█▄▐▀▀▪▄▐█▐▐▌
// ██ ██▌▐█▌▐█▄█▌ ▐█▌·▐█ ▪▐▌▐█▄▪▐█▐█▄▄▌██▐█▌
// ▀▀  █▪▀▀▀ ▀▀▀  ▀▀▀  ▀  ▀ ·▀▀▀▀  ▀▀▀ ▀▀ █▪
// `;
// 	logo = logo.replace(/[·.•▪]/g, ()=> choose("·.•▪"));
	var logo = draw_logo();
	var header = `Based on "${shader_title}" by ${shader_author_name} - ${shader_author_year}

${location.href}


randomly mutated with...

${logo}
(MUTAGEN, pre-alpha code mutation tool by Isaiah Odhner)`;
	var line_comment_token = "//";
	header = header.replace(/(^|\n)/g, `$1${line_comment_token} `).split("\n").map((line)=> line.trimEnd()).join("\n");
	console.assert(header.indexOf(attribution_header_start) === 0, "attribution_header_start didn't match at start of header");
	console.assert(header.indexOf(attribution_header_end) === header.length - attribution_header_end.length, "attribution_header_end didn't match at end of header");
	return header;
}
function add_or_replace_attribution_header(code) {
	var header = get_attribution_header();
	code = remove_attribution_header(code);
	// this is pretty silly trying to be language-agnostic here
	// (if we're gonna handle other languages that have e.g. # for comments, we'll already need to change/disable the header)
	// (and alternatively we could detect the language when adding support for coffeescript and python and all that)
	// but -- = lua, # = coffeescript, python, avoiding matching preprocessor directives
	var next_is_comment = code.match(/^\s*(\/[/*]|--|#(?!if|define|pragma|extension|include|version|error))/);
	var newlines = next_is_comment ? "\n\n\n\n\n" : "\n\n\n";
	code = header + newlines + code.replace(/^\s*\n/, "");
	return code;
}
function remove_attribution_header(code) {
	var header_start_index = code.indexOf(attribution_header_start);
	var end_start_index = code.indexOf(attribution_header_end);
	if (header_start_index > -1 && end_start_index > -1) {
		var header_end_index = end_start_index + attribution_header_end.length;
		code = code.slice(0, header_start_index) + code.slice(header_end_index);
	}
	return code;
}

async function try_edits(doc, edits_to_include) {
	var new_code = render_doc_to_string(doc, edits_to_include);
	new_code = add_or_replace_attribution_header(new_code);
	set_code_on_page(new_code);
	try {
		await compile_code_on_page(new_code);
	} catch (error) {
		return error;
	}
}

function bifurcate(array) {
	return [
		array.slice(0, array.length/2),
		array.slice(array.length/2),
	];
}

async function mutate_code_on_page() {
	try {
		window.mutagen_stop();
	} catch(e) {}

	var original_code = get_code_from_page();

	var stopped = false;
	window.mutagen_stop = ()=> {
		if (stopped) {
			return;
		}
		stopped = true;
		console.log("abort - reset to original code");
		set_code_on_page(original_code);
		compile_code_on_page();
	};

	var {doc, edits} = find_edit_points_skipping_line_comments(original_code);

	var max_edit_set_tries = 5;
	for (var edit_set_tries = 0; edit_set_tries < max_edit_set_tries; edit_set_tries++) {
		generate_mutations(edits);

		/* pseudo-code for the following algorithm

		Accepted edits := none
		Rejected edits := none
		Recurse(unvetted edits):
			Try with all accepted + unvetted edits
			If good,
				Accepted edits += unvetted edits
			Else
				If unvetted edits is just one edit
					Rejected edits += unvetted edits
				else
					[left, right] := bifurcate(unvetted edits)
					Recurse(left)
					Recurse(right)
		Recurse(all edits)
		Use accepted edits
		*/

		var accepted_edits = [];
		var rejected_edits = [];
		var null_edits = [];
		var unvetted_edits = edits.filter((edit)=> {
			if (edit.original_str === edit.mutation_str) {
				null_edits.push(edit);
				return false;
			}
			return true;
		});

		async function recursively_try_edit_set(unvetted_edits) {
			// console.log("recursively_try_edit_set", unvetted_edits);
			if (unvetted_edits.length === 0) {
				return;
			}
			if (stopped) {
				console.log("abort from recursively_try_edit_set");
				return;
			}

			// first, apply all edits and see if it works
			let edits_to_try = [...accepted_edits, ...unvetted_edits];

			var error = await try_edits(doc, edits_to_try);
			// console.log("tried", edits_to_try, "got", error);
			if (!error) {
				console.log("accepting edits:", unvetted_edits);
				accepted_edits = accepted_edits.concat(unvetted_edits);
				record_thumbnail();
			} else {
				// console.log(unvetted_edits, error);
				if (unvetted_edits.length <= 1) {
					console.log("rejecting edits:", unvetted_edits, "because", error.message);
					rejected_edits = rejected_edits.concat(unvetted_edits);
				} else {
					var [left, right] = bifurcate(unvetted_edits);
					await recursively_try_edit_set(left);
					await recursively_try_edit_set(right);
				}
			}
		}
		await recursively_try_edit_set(unvetted_edits);

		if (stopped) {
			console.log("abort from mutate_code_on_page");
			return;
		}

		// set code on page to use accepted edits and recompile
		await try_edits(doc, accepted_edits);

		var new_code = render_doc_to_string(doc, accepted_edits);
		new_code = add_or_replace_attribution_header(new_code);
		var new_code_from_page = get_code_from_page();

		console.assert(new_code === new_code_from_page, "got different code from page as should have been generated");

		if (remove_attribution_header(new_code).trim() === remove_attribution_header(original_code).trim()) {
			console.log(`new_code is same as original_code, LAME (edit set try: ${edit_set_tries+1}/${max_edit_set_tries})`);
		} else {
			console.assert(accepted_edits.length > 0);
			console.log("mutation finished", {accepted_edits});
			stopped = true;
			return;
		}
	}
	console.log("mutation finished - unsuccessful");
	stopped = true;
}

function add_buttons_to_page() {
	var existingButton = document.getElementById("mutate");
	if (existingButton) { existingButton.remove(); }
	var existingButton = document.getElementById("mutagen-abort");
	if (existingButton) { existingButton.remove(); }

	var mutateButton = document.createElement("button");
	mutateButton.id = "mutate";
	mutateButton.textContent = "☢ MUTATE ☢";
	mutateButton.onclick = async function() {
		mutateButton.disabled = true;
		abortButton.disabled = false;
		await mutate_code_on_page();
		mutateButton.disabled = false;
		abortButton.disabled = true;
	};

	var abortButton = document.createElement("button");
	abortButton.id = "mutagen-abort";
	abortButton.textContent = "ABORT";
	abortButton.onclick = ()=> {
		window.mutagen_stop();
		abortButton.disabled = true;
		setTimeout(()=> { mutateButton.disabled = false; }, 200);
	};

	var toolbar = document.querySelector("#toolBar, #toolbar, #tool-bar, #controls");
	if (location.hostname.match(/ShaderToy/i)) {
		// let's not bother trying to fit in a layout based around absolute positions
		// just insert it below the toolbar
		toolbar.parentElement.insertBefore(abortButton, toolbar.nextSibling);
		toolbar.parentElement.insertBefore(mutateButton, toolbar.nextSibling);
	} else {
		toolbar.appendChild(mutateButton);
		toolbar.appendChild(abortButton);
	}
}

try {
	window.mutagen_stop();
} catch(e) {}

record_thumbnail();
add_buttons_to_page();
mutate_code_on_page();

/*
FIXME: canvas snapshotted and/or tested for blankness before the shader is loaded and rendered

FIXME: Assertion failed: got different code from page as should have been generated

TODO: improve handling of shadertoy tabs:
	protect against switching tabs while mutations are being made
	detect errors only in selected tab
	don't bother looking at the canvas if modifying the Sound tab

Some other things that would be good:

GUI:
	maybe put the mutate + abort buttons in a container with the specimen palette
	add some text explaining the double click if that's gonna be a thing
	a draggable, resizable window to put the GUI in
	background process cursor while mutating?

thumbnail/history/specimen grid/palette:
	maybe create stacks when a single mutation session generates interim results
	option to generate a bunch at a time, with rows or stacks
	rows could be from progressively accepting subsets of one changeset,
	and then there'd be a few rows, with totally different changesets
	delete thumbnails (with undo)
	animation (a few frames)? (on hover or always?)
	collapse stacks of similar looking frames? (would need a similarity metric)
	allow sort/arrange by:
		time created (current order)
		ancestry (need to store what something was generated from) (and then just flatten the tree)
		or t-SNE (see below)

if you're going to be creating a bunch of programs with similar structure,
	breeding could be an option
	(not to mention possibilities of merging unrelated programs by applying random functions between them etc., or reconciling semi-related programs by correlating them)
	so could graphically arranging the specimens with t-SNE
		https://cs.stanford.edu/people/karpathy/tsnejs/

operate on selection if there's a selection (and update bounds of selection)
	multiple selections

platform support
	support bytebeat again [on windows93.net too]
	khan academy, including "error buddy" detection
	code fiddles like jsfiddle, codepen, jsbin, fiddle salad

wrap values sometimes in a function, like i did for:
	https://www.khanacademy.org/computer-programming/phantasmagoria/2540238893
	https://www.khanacademy.org/computer-programming/phantasmagoria-plus/6066580222902272
	oooh, aside from just introducing varying and interesting animation,
		it could use *sound* specifically as an input, so it makes things into visualizers :D

a mode where mutations are applied only after the time when they were generated/applied
	allowing for playback of the history of mutation
	time > ${get_time_from_page()} ? mutation : original
	(time as in iTime in shadertoy, t in bytebeat; could create a startTime variable to compare against in other environments (jsfiddle etc.))

save code of all shadertoy tabs?

maybe export an image with all the thumbnails, with all the codes embedded, that you can load back in and pick from

*/
