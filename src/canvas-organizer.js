// src/canvas-organizer.ts
export default function initCanvasOrganizer() {
    document.addEventListener("DOMContentLoaded", () => {
        (function() {
            'use strict';

            // ==UserScript==
// @name         Canvas Dashboard Organizer (Commented Version)
// @namespace    http://tampermonkey.net/
// @version      9.1
// @description  Custom visibility + fully featured tag system for Canvas dashboard (with detailed comments)
// @match        https://udel.instructure.com/*
// @grant        none
// ==/UserScript==

(function () {
'use strict';

/* ---------------- STATE ---------------- */

// Keep track of the last URL so we can detect SPA (single-page-app) navigation changes
let lastUrl = location.href;

// Cache all courses for the tag system
let cachedCourses = [];

/* ---------------- UTIL FUNCTIONS ---------------- */

// Extract the course ID from a course card element
function getCourseId(card){
 const link = card.querySelector('a.ic-DashboardCard__link');
 return link?.href.match(/courses\/(\d+)/)?.[1]; // returns course ID as string
}

/* ---------------- FETCH COURSES ---------------- */

// Fetch all active courses from Canvas API
async function fetchCourses(){
 try{
  const res = await fetch("/api/v1/courses?per_page=100&enrollment_state=active");
  const data = await res.json();
  // return simplified array: {id, name} for each course
  return data.map(c=>({id:String(c.id), name:c.name}));
 }catch{return [];}
}

/* ---------------- VISIBILITY SYSTEM ---------------- */

// Get visibility settings from localStorage
function getVisibility(){
 return JSON.parse(localStorage.getItem("canvas-visibility")||"{}");
}

// Save visibility settings to localStorage
function saveVisibility(v){
 localStorage.setItem("canvas-visibility",JSON.stringify(v));
}

// Apply visibility to all course cards on the dashboard
function applyVisibility(){
 const visibility = getVisibility();

 document.querySelectorAll(".ic-DashboardCard").forEach(card=>{
  const id=getCourseId(card);
  if(!id) return;

  // Hide the card if visibility is explicitly false, otherwise show it
  card.style.display = visibility[id] === false ? "none" : "";
 });
}

/* ---------------- TAG SYSTEM ---------------- */

// Get tags from localStorage
function getTags(){
 try{
  const t = JSON.parse(localStorage.getItem("canvas-tags")||"{}");

  // Ensure each tag object has correct structure
  Object.keys(t).forEach(k=>{
   if(Array.isArray(t[k])) t[k]={courses:t[k],color:"#e3e3e3",order:0};
   t[k].courses ||= [];
   t[k].color ||= "#e3e3e3";
   t[k].order ??= 0;
  });
  return t;
 }catch{return {};}
}

// Save tags to localStorage
function saveTags(t){
 localStorage.setItem("canvas-tags",JSON.stringify(t));
}

// Determine text color (black/white) based on background color contrast
function contrast(hex){
 hex=(hex||"#e3e3e3").replace("#","");
 const r=parseInt(hex.substr(0,2),16);
 const g=parseInt(hex.substr(2,2),16);
 const b=parseInt(hex.substr(4,2),16);
 return ((r*299+g*587+b*114)/1000)<140?"#fff":"#000";
}

// Render tags under each course card
function renderTags(){

 const tags=getTags();

 document.querySelectorAll(".ic-DashboardCard").forEach(card=>{

  const id=getCourseId(card);
  if(!id) return;

  // Find or create a container for tags
  let box=card.querySelector(".canvas-tags");
  if(!box){
   box=document.createElement("div");
   box.className="canvas-tags";
   box.style.marginTop="6px";
   card.appendChild(box);
  }

  box.innerHTML=""; // clear previous tags

  // Sort tags by order (priority) and render the ones assigned to this course
  Object.entries(tags)
   .sort((a,b)=>a[1].order-b[1].order)
   .forEach(([tag,data])=>{
    if(data.courses.includes(id)){
     const el=document.createElement("span");
     el.textContent=tag;
     el.style.background=data.color;
     el.style.color=contrast(data.color);
     el.style.padding="2px 6px";
     el.style.marginRight="4px";
     el.style.borderRadius="6px";
     el.style.fontSize="11px";
     box.appendChild(el);
    }
   });

 });
}

/* ---------------- ADD DASHBOARD BUTTONS ---------------- */

function addButtons(){

 // Avoid duplicating buttons
 if(document.getElementById("canvas-btns")) return;

 const wrap=document.createElement("div");
 wrap.id="canvas-btns";
 wrap.style.margin="10px";

 // Visibility button
 const vis=document.createElement("button");
 vis.textContent="Visibility";
 vis.onclick=openVisibility;

 // Tag editor button
 const tag=document.createElement("button");
 tag.textContent="Tags";
 tag.style.marginLeft="8px";
 tag.onclick=openTags;

 wrap.appendChild(vis);
 wrap.appendChild(tag);

 // Prepend to dashboard header or body
 (document.querySelector(".ic-Dashboard-header")||document.body).prepend(wrap);
}

/* ---------------- VISIBILITY POPUP ---------------- */

async function openVisibility(){

 const courses = await fetchCourses();
 const visibility = getVisibility();

 const overlay=makeOverlay();

 let html="<h3>Customize Visibility</h3>";

 // Generate checkbox list for all courses
 courses.forEach(c=>{
  const checked = visibility[c.id] !== false;
  html+=`
  <label>
   <input type="checkbox" data-id="${c.id}" ${checked?"checked":""}>
   ${c.name}
  </label><br>`;
 });

 html+=`<br><button id="save">Save</button> <button id="close">Close</button>`;

 overlay.innerHTML=wrapModal(html);

 // Close button removes overlay
 overlay.querySelector("#close").onclick=()=>overlay.remove();

 // Save button updates visibility in localStorage and refreshes UI
 overlay.querySelector("#save").onclick=()=>{
  const newVis={};
  overlay.querySelectorAll("[data-id]").forEach(b=>{
   newVis[b.dataset.id]=b.checked;
  });

  saveVisibility(newVis);
  applyVisibility();
  overlay.remove();
 };
}

/* ---------------- TAG POPUP ---------------- */

async function openTags(){

 // Fetch courses to allow assigning tags
 cachedCourses = await fetchCourses();
 let tags=getTags();

 const overlay=makeOverlay();

 const presetColors=["#ef4444","#f97316","#facc15","#22c55e","#3b82f6","#8b5cf6","#ec4899","#6b7280"];

 // Header with new tag input
 let html="<h3>Tags</h3>";
 html+=`<input id="new-tag" placeholder="Tag name"> <button id="create">Create</button><hr>`;

 // Loop through existing tags
 Object.entries(tags)
  .sort((a,b)=>a[1].order-b[1].order)
  .forEach(([tag,data])=>{

  html+=`<h4>
   ${data.order+1}. 
   <input class="name" data-old="${tag}" value="${tag}"> 
   <span class="color-box" data-tag="${tag}" style="display:inline-block;width:16px;height:16px;background:${data.color};cursor:pointer;"></span>
   <input type="color" data-color="${tag}" value="${data.color}" style="display:none">
   ${presetColors.map(c=>`<span class="preset" data-tag="${tag}" data-color="${c}" style="display:inline-block;width:12px;height:12px;background:${c};margin-right:2px;cursor:pointer;"></span>`).join("")}
   <button data-up="${tag}">↑</button>
   <button data-down="${tag}">↓</button>
   <button data-del="${tag}">x</button>
  </h4>`;

  // Checkbox list for courses for this tag
  cachedCourses.forEach(c=>{
   html+=`
   <label>
    <input type="checkbox" data-tag="${tag}" data-course="${c.id}" ${data.courses.includes(c.id)?"checked":""}>
    ${c.name}
   </label><br>`;
  });

  html+="<hr>";
 });

 html+=`<button id="save">Save</button> <button id="close">Close</button>`;

 overlay.innerHTML=wrapModal(html);

/* ---------------- TAG INTERACTIONS ---------------- */

 // Close overlay
 overlay.querySelector("#close").onclick=()=>overlay.remove();

 // Create new tag
 overlay.querySelector("#create").onclick=()=>{
  const name=overlay.querySelector("#new-tag").value.trim();
  if(!name) return;
  tags[name]={courses:[],color:"#e3e3e3",order:Object.keys(tags).length};
  saveTags(tags);
  overlay.remove();
  openTags(); // refresh popup
 };

 // Delete tag
 overlay.querySelectorAll("[data-del]").forEach(btn=>{
  btn.onclick=()=>{
   delete tags[btn.dataset.del];
   saveTags(tags);
   overlay.remove();
   openTags();
  };
 });

 // Color picker logic
 overlay.querySelectorAll(".color-box").forEach(box=>{
  const t=box.dataset.tag;
  const picker=overlay.querySelector(`[data-color="${t}"]`);
  box.onclick=()=>picker.click();
  picker.oninput=()=>box.style.background=picker.value;
 });

 // Preset colors
 overlay.querySelectorAll(".preset").forEach(p=>{
  p.onclick=()=>{
   const t=p.dataset.tag;
   const c=p.dataset.color;
   overlay.querySelector(`.color-box[data-tag="${t}"]`).style.background=c;
   overlay.querySelector(`[data-color="${t}"]`).value=c;
  };
 });

 // Reordering tags
 function swap(a,b){
  const temp=tags[a].order;
  tags[a].order=tags[b].order;
  tags[b].order=temp;
 }

 overlay.querySelectorAll("[data-up]").forEach(btn=>{
  btn.onclick=()=>{
   const keys=Object.keys(tags).sort((a,b)=>tags[a].order-tags[b].order);
   const i=keys.indexOf(btn.dataset.up);
   if(i>0){swap(keys[i],keys[i-1]);saveTags(tags);overlay.remove();openTags();}
  };
 });

 overlay.querySelectorAll("[data-down]").forEach(btn=>{
  btn.onclick=()=>{
   const keys=Object.keys(tags).sort((a,b)=>tags[a].order-tags[b].order);
   const i=keys.indexOf(btn.dataset.down);
   if(i<keys.length-1){swap(keys[i],keys[i+1]);saveTags(tags);overlay.remove();openTags();}
  };
 });

 // Save all tag changes
 overlay.querySelector("#save").onclick=()=>{

  const newTags={};

  // Update names and order
  overlay.querySelectorAll(".name").forEach(inp=>{
   const old=inp.dataset.old;
   let name=inp.value.trim()||old;
   if(newTags[name]) name+="_"; // prevent duplicate names
   newTags[name]={courses:[],color:tags[old].color,order:tags[old].order};
  });

  // Assign courses to tags
  overlay.querySelectorAll("[data-tag]").forEach(b=>{
   if(b.checked){
    const old=b.dataset.tag;
    const name=overlay.querySelector(`.name[data-old="${old}"]`).value.trim()||old;
    newTags[name].courses.push(b.dataset.course);
   }
  });

  // Update colors
  overlay.querySelectorAll("[data-color]").forEach(inp=>{
   const old=inp.dataset.color;
   const name=overlay.querySelector(`.name[data-old="${old}"]`).value.trim()||old;
   newTags[name].color=inp.value;
  });

  saveTags(newTags);
  overlay.remove();
  renderTags();
 };
}

/* ---------------- HELPERS ---------------- */

// Create a full-screen overlay for popups
function makeOverlay(){
 const o=document.createElement("div");
 Object.assign(o.style,{
  position:"fixed",top:0,left:0,width:"100%",height:"100%",
  background:"rgba(0,0,0,0.4)",
  display:"flex",alignItems:"center",justifyContent:"center",
  zIndex:9999
 });
 document.body.appendChild(o);
 return o;
}

// Wrap HTML content in a modal box
function wrapModal(html){
 return `<div style="background:white;padding:20px;border-radius:10px;max-height:80vh;overflow:auto;">${html}</div>`;
}

/* ---------------- INIT ---------------- */

function init(){
 if(!document.querySelector(".ic-DashboardCard")) return;

 applyVisibility();
 renderTags();
 addButtons();
}

/* SPA SUPPORT */
// Check every 0.5s if URL changed (Canvas uses SPA navigation)
setInterval(()=>{
 if(location.href !== lastUrl){
  lastUrl = location.href;
  init();
 }
},500);

// Refresh periodically in case dashboard loads later
setInterval(init,1000);

})();

        })();
    });
}