function findEditPoints(code, mutation_chance) {
	var doc = [];
	var editPoints = new Set();

	// the first group here is in lieu of negative lookbehinds in javascript
	var numbersRegExp = /([^a-z$_]|^)(0x[\dA-F]+|\d+(?:\.\d*)?|\.\d+)(?!e)/gi;
	var match;
	var lastMatchLastIndex = 0;
	while ((match = numbersRegExp.exec(code)) !== null) {
		var [match_str, negative_match_group_str, num_str] = match;
		console.log('Found', {match, match_str, negative_match_group_str, num_str});
		console.log('Next match starts at ' + numbersRegExp.lastIndex);
		doc.push(code.slice(lastMatchLastIndex, match.index + negative_match_group_str.length));
		if (isNaN(num_str)) {
			console.log(`somehow matched ${num_str} (full match_str = ${match_str})`);
			doc.push(editPoint);
		} else {
			var editPoint = {
				type: "number",
				originalStr: num_str,
				modifiedStr: mutateNumber(num_str, mutation_chance), // TODO: do this in separate step, remove mutation_chance from args above
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
	var cast = (n)=> {
		if (had_dot && `${n}`.indexOf(".") === -1) {
			return `${n}.0`;
		} else if (!had_dot) {
			return `${Math.ceil(n)}`;
		}
		return n;
	}
	// console.log(`matched ${num_str}`, {n, had_dot, num_str});

	// console.log("mutate number", n);
	if (Math.random() < mutation_chance) { n += 1; }
	if (Math.random() < mutation_chance) { n -= 1; }
	if (Math.random() < mutation_chance) { n /= 2; }
	if (Math.random() < mutation_chance) { n *= 2; }
	if (isNaN(n)) {
		console.warn(`somehow got ${n} from ${JSON.stringify(num_str)}`);
		return num_str;
	} else if (n < 0 && original_n >= 0) {
		return "(" + cast(n - 1) + ")";
	}
	return cast(n);
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
function didCompileFail() {
	// TODO: bytebeat
	if (document.querySelector(".tab.errorYes, .CodeMirror .errorMessage")) {
		return true;
	}
	return false;
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
				var success = !didCompileFail();
				if (success) resolve(); else reject(new Error("compile failed"));
			}
		}
		waitForCompileFinish();
	});
}

function mutateCodeOnPage() {
	var original_code = getCodeFromPage();
	var mutation_chance = 0.05 + 1 / original_code.length;

	// TODO: try sets of edits in a sort of binary search of whether it can compile with a given set (accept set of edits) and whether a particular single edit makes it not compile (reject one edit)

	var {doc, editPoints} = findEditPoints(original_code, mutation_chance);
	console.log({doc, editPoints});
	var new_code = renderDocToString(doc, editPoints);
	console.log("new_code", new_code);
	if (new_code === original_code) {
		console.log("new_code is same as original_code, LAME");
	}

	setCodeOnPage(new_code);

	compileCodeOnPage(new_code).then(()=> {
		console.log("compile succeeded");
	},	(error)=> {
		console.log("compile failed");
	});
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

addButtonToUI();
mutateCodeOnPage();

/*
some other things that would be good:
detect not just compilation failure but also blank canvas (all pixels same color)
support bytebeat again [on windows93.net too]
khan academy, including "error buddy" detection
code fiddles like jsfiddle, codepen, jsbin
maybe insert a header at the top that explains the (wild) modifications (good for forking)
wrap values sometimes in a function, like i did for:
	https://www.khanacademy.org/computer-programming/phantasmagoria/2540238893
	https://www.khanacademy.org/computer-programming/phantasmagoria-plus/6066580222902272
*/
