function findEditPoints(code) {
	var doc = [];
	var editPoints = new Set();

	// the first group here is in lieu of negative lookbehinds in javascript,
	// to avoid starting matching from inside an identifier
	var numbersRegExp = /([^a-z0-9$_]|^)(0x[\dA-F]+|\d+(?:\.\d*)?|\.\d+)(?!e)/gi;
	var match;
	var lastMatchLastIndex = 0;
	while ((match = numbersRegExp.exec(code)) !== null) {
		var [match_str, negative_match_group_str, num_str] = match;
		doc.push(code.slice(lastMatchLastIndex, match.index + negative_match_group_str.length));
		if (isNaN(num_str)) {
			console.warn(`somehow matched ${num_str} (full match_str = ${match_str})`);
			doc.push(editPoint);
		} else {
			var editPoint = {
				type: "number",
				originalStr: num_str,
				modifiedStr: num_str,
			};
			editPoints.add(editPoint);
			doc.push(editPoint);
		}
		lastMatchLastIndex = numbersRegExp.lastIndex;
	}
	doc.push(code.slice(lastMatchLastIndex));

	return {doc, editPoints};
}

function mutateNumber(num_str, mutation_chance) {
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

	// console.log(`mutate ${num_str}`, {n, had_dot, num_str});

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

function renderDocToString(doc, editPointsSet) {
	return doc.map((fragment)=> {
		if (typeof fragment === "string") {
			return fragment;
		} else if (editPointsSet.has(fragment)) {
			return fragment.modifiedStr;
		} else {
			return fragment.originalStr;
		}
	}).join("");
}

function getCodeFromPage() {
	//var textarea = document.querySelector("#code");
	//var original_code = textarea.value;
	var cm = document.querySelector('.CodeMirror').CodeMirror;
	return cm.getValue();
}
function setCodeOnPage(new_code) {
	// TODO for bytebeat: would seem to need to be async
	//textarea.focus();
	//setTimeout(function(){
		//textarea.select();
		//document.execCommand("InsertText", false, new_code);
	//});
	var cm = document.querySelector('.CodeMirror').CodeMirror;
	cm.setValue(new_code);
}

function findProblem() {
	// TODO: bytebeat
	// var errorMessageEl = document.querySelector(".CodeMirror .errorMessage");
	// if (errorMessageEl && getComputedStyle(errorMessageEl).visibility !== "hidden") {
	var errorMessageEl = document.querySelector(".CodeMirror-linewidget .errorMessage");
	if (errorMessageEl && getComputedStyle(errorMessageEl).visibility !== "hidden") {
		return new Error(`compile failed: ${errorMessageEl.textContent}`);
	}
	if (document.querySelector(".tab.errorYes")) {
		return new Error("compile failed (in some tab)");
	}
	// TODO: maybe testing the canvas for whether it's blank (after rendering a frame) is be expensive enough
	// that it should first do a pass just checking that it compiles, and check *at the end* if it's blank,
	// and if it's blank then start over but checking also for blankness every time
	if (!isOutputCanvasInteresting()) {
		return new Error("output looks boring / blank");
	}
}

var outputCanvas = document.querySelector("canvas#demogl, canvas.playerCanvas, #player canvas, #content canvas, canvas");
var testCanvas = document.createElement("canvas");
var testCtx = testCanvas.getContext("2d");
testCanvas.width = 10;
testCanvas.height = 10;

function isOutputCanvasInteresting() {
	testCtx.clearRect(0, 0, testCanvas.width, testCanvas.height);
	testCtx.drawImage(outputCanvas, 0, 0, testCanvas.width, testCanvas.height);

	var imageData = testCtx.getImageData(0, 0, testCanvas.width, testCanvas.height);
	var [r, g, b] = imageData.data;
	var threshold = 25;
	var interesting = false;
	for (var i=0; i<imageData.data.length; i+=4) {
		var diff =
			Math.abs(imageData.data[i+0] - r) +
			Math.abs(imageData.data[i+1] - g) +
			Math.abs(imageData.data[i+2] - b);
		if (diff > threshold) {
			interesting = true;
		}
	}
	return interesting;
}

function isCompiling() {
	// TODO: bytebeat
	return document.querySelector("#compilationTime").textContent.match(/Compiling/i);
}
function compileCodeOnPage() {
	//compile(new_code); // bytebeat
	document.querySelector("[title~='Compile']").click(); // shadertoy

	return new Promise((resolve, reject)=> {
		function waitForCompileFinish() {
			if (isCompiling()) {
				setTimeout(waitForCompileFinish, 50);
			} else {
				setTimeout(()=> { // may not be needed!
					var error = findProblem();
					if (error) { reject(error); } else { resolve(); }
				}, 5);
			}
		}
		waitForCompileFinish();
	});
}
function genModifications(editPoints, mutation_chance) {
	for (var editPoint of editPoints) {
		if (editPoint.type === "number") {
			editPoint.modifiedStr = mutateNumber(editPoint.originalStr, mutation_chance);
		}
	}
}

function addOrReplaceAttributionHeader(code) {
	var shaderTitle = document.querySelector("#shaderTitle").textContent;
	var shaderAuthorName = document.querySelector("#shaderAuthorName").textContent;
	var shaderAuthorDate = document.querySelector("#shaderAuthorDate").textContent;
	var shaderAuthorYear = shaderAuthorDate.replace(/-.*/, "");
	var header = `// 
// Based on "${shaderTitle}" by ${shaderAuthorName} - ${shaderAuthorYear}
//
// ${location.href}
//
//
// randomly modified with...
// 
//  _   .-')                .-') _      ('-.                   ('-.       .-') _  
// ( '.( OO )_             (  OO) )    ( OO ).-.             _(  OO)     ( OO ) ) 
//  ,--.   ,--.),--. ,--.  /     '._   / . --. /  ,----.    (,------.,--./ ,--,'  
//  |   \`.'   | |  | |  |  |'--...__)  | \-.  \  '  .-./-')  |  .---'|   \ |  |\  
//  |         | |  | | .-')'--.  .--'.-'-'  |  | |  |_( O- ) |  |    |    \|  | ) 
//  |  |'.'|  | |  |_|( OO )  |  |    \| |_.'  | |  | .--, \(|  '--. |  .     |/  
//  |  |   |  | |  | | \`-' /  |  |     |  .-.  |(|  | '. (_/ |  .--' |  |\    |   
//  |  |   |  |('  '-'(_.-'   |  |     |  | |  | |  '--'  |  |  \`---.|  | \   |   
//  \`--'   \`--'  \`-----'      \`--'     \`--' \`--'  \`------'   \`------'\`--'  \`--'
// 
// (MUTAGEN, pre-alpha)

`;
	if (code.indexOf(header) < 0) {
		code = header + code;
	}
	return code;
}

async function tryEdits(doc, edit_points) {
	var new_code = renderDocToString(doc, edit_points);
	new_code = addOrReplaceAttributionHeader(new_code);
	setCodeOnPage(new_code);
	try {
		await compileCodeOnPage(new_code);
	} catch (error) {
		return error;
	}
}

function bifurcateSet(set) {
	var left = new Set();
	var right = new Set();
	var i = 0;
	for (var item of set) {
		(i >= set.size/2 ? right : left).add(item);
		i++;
	}
	return [left, right];
}

async function mutateCodeOnPage() {
	var original_code = getCodeFromPage();
	var mutation_chance = 0.01 + (0.5 / original_code.length);

	var {doc, editPoints} = findEditPoints(original_code, mutation_chance);

	for (var edit_set_tries = 0; edit_set_tries < 5; edit_set_tries++) {
		genModifications(editPoints, mutation_chance);

		var acceptedEdits = new Set();
		var rejectedEdits = new Set();

		// TODO: accept all null modifications (originalStr === modifiedStr)

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

		async function recursivelyTryEditSet(unvettedEdits) {
			// console.log("recursivelyTryEditSet", unvettedEdits);
			if (unvettedEdits.size === 0) {
				return;
			}

			// first, apply all edits and see if it works
			let testSet = new Set([...acceptedEdits, ...unvettedEdits]);

			var error = await tryEdits(doc, testSet);
			// console.log("tried testSet", testSet, "got", error);
			if (!error) {
				console.log("accepting edits:", unvettedEdits);
				unvettedEdits.forEach(acceptedEdits.add, acceptedEdits);
				return;
			} else {
				// console.log(unvettedEdits, error);
				if (unvettedEdits.size <= 1) {
					console.log("rejecting edits:", unvettedEdits, "because", error.message);
					unvettedEdits.forEach(rejectedEdits.add, rejectedEdits);
				} else {
					var subsets = bifurcateSet(unvettedEdits);
					for (var subset of subsets) {
						await recursivelyTryEditSet(subset);
					}
				}
			}
		}
		await recursivelyTryEditSet(editPoints);

		// set code on page to use accepted edits and recompile
		await tryEdits(doc, acceptedEdits);

		var new_code = renderDocToString(doc, acceptedEdits);
		new_code = addOrReplaceAttributionHeader(new_code);
		var new_code_from_page = getCodeFromPage();
		console.assert(new_code === new_code_from_page, "got different code from page as should have been generated");
		if (new_code === original_code) {
			console.log("new_code is same as original_code, LAME");
		} else {
			break;
		}
	}
}

function addButtonToUI() {
	var button = document.getElementById("mutate") || document.createElement("button");
	button.id = "mutate";
	button.textContent = "☢ MUTATE ☢";
	var toolbar = document.querySelector("#toolBar, #toolbar, #tool-bar, #controls");
	if (location.hostname.match(/ShaderToy/i)) {
		// let's not bother trying to fit in a layout based around absolute positions
		// just insert it below the toolbar
		toolbar.parentElement.insertBefore(button, toolbar.nextSibling);
	} else {
		toolbar.appendChild(button);
	}
	button.onclick = mutateCodeOnPage;
}

await mutateCodeOnPage();
addButtonToUI();

/*
TODO: protect against starting while already running, maybe have a stop button

Some other things that would be good:

present a grid of thumbnails of a bunch of variations to pick from
	rows could be from progressively accepting subsets of one changeset,
	and then there'd be a few rows, with totally different changesets

operate on selection if there's a selection (and update bounds of selection)
	multiple selections

platform support
	support bytebeat again [on windows93.net too]
	khan academy, including "error buddy" detection
	code fiddles like jsfiddle, codepen, jsbin

wrap values sometimes in a function, like i did for:
	https://www.khanacademy.org/computer-programming/phantasmagoria/2540238893
	https://www.khanacademy.org/computer-programming/phantasmagoria-plus/6066580222902272
*/
