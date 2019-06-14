function findEditPoints(code) {
	var doc = [];
	var editPoints = new Set();

	// the first group here is in lieu of negative lookbehinds in javascript, to try to make sure we're not in an identifier
	var numbersRegExp = /([^a-z0-9$_]|^)(0x[\dA-F]+|\d+(?:\.\d*)?|\.\d+)(?!e)/gi;
	var match;
	var lastMatchLastIndex = 0;
	while ((match = numbersRegExp.exec(code)) !== null) {
		var [match_str, negative_match_group_str, num_str] = match;
		// console.log('Found', {match, match_str, negative_match_group_str, num_str});
		// console.log('Next match starts at ' + numbersRegExp.lastIndex);
		doc.push(code.slice(lastMatchLastIndex, match.index + negative_match_group_str.length));
		if (isNaN(num_str)) {
			console.log(`somehow matched ${num_str} (full match_str = ${match_str})`);
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
	var cast = (n)=> {
		if (had_dot && `${n}`.indexOf(".") === -1) {
			return `${n}.0`;
		} else if (!had_dot) {
			return `${Math.ceil(n)}`;
		}
		return `${n}`;
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
function findProblem() {
	// TODO: bytebeat
	if (document.querySelector(".tab.errorYes, .CodeMirror .errorMessage")) {
		return new Error("compile failed");
	}
	// TODO: detect not just compilation failure but also blank canvas (all pixels same color)
	// maybe testing the canvas for whether it's blank (after rendering a frame) would be expensive enough that it should
	// do that as a later pass after first just making sure it compiles and checking at the end that it's not blank
	// (and at *that* point check every time that it's not blank)
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
				var error = findProblem();
				setTimeout(()=> { // may not be needed!
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

async function tryEdits(doc, edit_points) {
	var new_code = renderDocToString(doc, edit_points);
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
		// [left, right][i % 2].add(item); // alternating
		(i > set.size/2 ? right : left).add(item); // split in half
		i++;
	}
	return [left, right];
}

async function mutateCodeOnPage() {
	var original_code = getCodeFromPage();
	var mutation_chance = 0.05 + 1 / original_code.length;

	var {doc, editPoints} = findEditPoints(original_code, mutation_chance);

	for (var edit_set_tries = 0; edit_set_tries < 5; edit_set_tries++) {
		genModifications(editPoints, mutation_chance);

		var acceptedEdits = new Set();
		var rejectedEdits = new Set();

		// TODO: accept all null modifications (originalStr === modifiedStr)

		// // first, apply all edits and see if it works
		// var error = await tryEdits(doc, editPoints);
		// if (!error) {
		// 	return;
		// }
	
		// // then, start with no edits, and add points progressively, testing each time
		// var testSet = new Set;
		// for (var editPoint of editPoints) {
		// 	testSet.add(editPoint);
		// 	console.log("try with", editPoint, "total", testSet.size);
		// 	var error = await tryEdits(doc, testSet);
		// 	if (error) {
		// 		console.log(error);
		// 		testSet.delete(editPoint);
		// 	}
		// }

		// var acceptedAndTestingSet = new Set();
		// async function recur(testSet) {
		// 	// first, apply all edits and see if it works
		// 	var error = await tryEdits(doc, testSet);
		// 	if (!error) {
		// 		return testSet;
		// 	}
		
		// 	// otherwise, split the set in twain
		// 	var subsets = bifurcateSet(testSet);

		// 	for (var subset of subsets) {
		// 		for (var editPoint of subset) {
		// 			acceptedAndTestingSet.add(editPoint);
		// 		}
		// 		console.log("try with adding", subset, "total edits", acceptedAndTestingSet.size);
		// 		var error = await tryEdits(doc, acceptedAndTestingSet);
		// 		if (error) {
		// 			console.log(error);
		// 			for (var editPoint of subset) {
		// 				acceptedAndTestingSet.delete(editPoint);
		// 			}
		// 			await recur(subset);
		// 		}
		// 	}
		// 	return new Set(acceptedAndTestingSet);
		// }
		// await recur(editPoints);

		// Accepted edits = none
		// R(unvetted edits):
		// 	Try with all accepted + unvetted edits
		// 	if good,
		// 		Accepted edits += unvetted edits
		// 	else
		// 		if unvetted edits is one edit
		// 			Rejected edits += unvetted edits
		// 			Unvetted edits = none
		// 		else
		// 			[left, right] = bifurcate(unvetted edits)
		// 			R(left)
		// 			R(right)
		// R(all edits)
		// use accepted edits

		async function recursivelyTryEditSet(unvettedEdits) {
			console.log("recursivelyTryEditSet", unvettedEdits);

			// first, apply all edits and see if it works
			let testSet = new Set([...acceptedEdits, ...unvettedEdits]);

			console.log("tryEdits", doc, testSet);
			var error = await tryEdits(doc, testSet);
			console.log("end tryEdits", doc, testSet);
			console.log("tried testSet", testSet, "got", error);
			if (!error) {
				unvettedEdits.forEach(acceptedEdits.add, acceptedEdits);
				return;
			} else {
				console.log(unvettedEdits, error);
				if (unvettedEdits.size <= 1) {
					unvettedEdits.forEach(rejectedEdits.add, rejectedEdits);
					// unvettedEdits = new Set();
				} else {
					var subsets = bifurcateSet(testSet);
					// subsets.forEach(recursivelyTryEditSet);
					for (var subset of subsets) {
						await recursivelyTryEditSet(subset);
					}
				}
			}
		}
		recursivelyTryEditSet(editPoints);

		tryEdits(doc, acceptedEdits);

		console.log({acceptedEdits});

		// var new_code = renderDocToString(doc, acceptedAndTestingSet);
		var new_code = renderDocToString(doc, acceptedEdits);
		var new_code_from_page = getCodeFromPage();
		console.assert(new_code === new_code_from_page, "got different code from page as should have been generated");
		// console.log("new_code", new_code);
		if (new_code === original_code) {
			console.log("new_code is same as original_code, LAME");
		} else {
			break;
		}
	}

	// TODO: try sets of edits in a sort of binary search of whether it can compile with a given set (accept set of edits) and whether a particular single edit makes it not compile (reject one edit)

	// if it doesn't, start with no edits and progressively add edits until all are tested to work (and included) or not (and rejected)
	// but only reject one at a time (whereas accepting multiple at a time is fine)
	// if at the end of this process, it compiles but the canvas is blank, start over but checking for compilation and canvas content at each step
	// if at the end of the process, the code is the same as the original, that's lame - try a new set of edits a few times

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
support bytebeat again [on windows93.net too]
khan academy, including "error buddy" detection
code fiddles like jsfiddle, codepen, jsbin
maybe insert a header at the top that explains the (wild) modifications (good for forking)
wrap values sometimes in a function, like i did for:
	https://www.khanacademy.org/computer-programming/phantasmagoria/2540238893
	https://www.khanacademy.org/computer-programming/phantasmagoria-plus/6066580222902272
*/
