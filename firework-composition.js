(function (global) {
  "use strict";

  function createFireworkComposition(canvas, options) {
    options = options || {};

    var transparent = options.transparent === true;
    var looping = options.loop !== false;
    var active = options.autoplay !== false;
    var flowerSize = options.flowerSize == null ? 1 : options.flowerSize;
    var ctx = canvas.getContext("2d", { alpha: transparent });
    var source = new Image();
    var SOURCE_W = 572;
    var SOURCE_H = 1024;
    var SHOW_DURATION = 9.6;
    // Include the final staggered burst and its longest particle lifetime.
    var ONE_SHOT_DURATION = 8.3;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var width = 0;
    var height = 0;
    var sceneScale = 1;
    var offsetX = 0;
    var offsetY = 0;
    var ready = false;
    var started = performance.now();
    var lastFrame = 0;
    var frameHandle = 0;
    var decorations = null;
    var decorationPieces = [];
    var topDecorations = null;
    var flowers = [];
    var particles = [];
    var headTarget = null;
    var headState = null;

    // Bounds measured from the supplied 937 x 1678 artwork. The original
    // pixels are copied into sprites; no flower is redrawn in code.
    var flowerSpecs = [
      {name:"top-radial",x:465,y:115,rx:72,ry:72,enter:.2,exit:7.72},
      {name:"blue-disc",x:127,y:124,rx:91,ry:91,enter:0,exit:7.4},
      {name:"pink-disc",x:114,y:350,rx:94,ry:93,enter:.3,exit:8},
      {name:"cyan-gear",x:287,y:298,rx:43,ry:43,enter:.8,exit:7.9},
      {name:"pink-gear",x:393,y:290,rx:39,ry:39,enter:1,exit:7.6},
      {name:"red-flower",x:216,y:435,rx:56,ry:55,enter:.7,exit:7.7},
      {name:"candy-pair",x:347,y:428,rx:47,ry:48,enter:1.3,exit:8},
      {name:"mint-star",x:447,y:468,rx:40,ry:40,enter:1.5,exit:7.6},
      {name:"yellow-star",x:136,y:540,rx:27,ry:27,enter:.9,exit:7.5},
      {name:"crystal-star",x:264,y:556,rx:46,ry:45,enter:1.1,exit:8},
      {name:"mint-radial",x:436,y:545,rx:43,ry:43,enter:.5,exit:7.6},
      {name:"pale-star",x:224,y:661,rx:36,ry:36,enter:1.4,exit:7.5},
      {name:"ring",x:382,y:645,rx:50,ry:51,enter:.6,exit:7.7},
      {name:"candy-bottom",x:421,y:731,rx:55,ry:55,enter:1,exit:8},
      {name:"large-radial",x:286,y:817,rx:71,ry:71,enter:.4,exit:7.9},
      {name:"purple-radial",x:123,y:882,rx:74,ry:74,enter:.9,exit:8},
      {name:"green-radial",x:465,y:909,rx:80,ry:80,enter:1.1,exit:8},
    ];
    flowerSpecs.forEach(function(spec) { spec.rings = [0, 1]; });
    // Spread exits across the whole composition, from 3.2 to 6.08 seconds.
    flowerSpecs.forEach(function (spec, index) { spec.exit = 3.2 + ((index * 7) % flowerSpecs.length) * 0.18; });

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function smooth(value) {
      var t = clamp(value, 0, 1);
      return t * t * (3 - 2 * t);
    }

    function back(value) {
      var t = clamp(value, 0, 1) - 1;
      return Math.max(0, 1 + 2.45 * t * t * t + 1.45 * t * t);
    }

    function resize() {
      var box = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sceneScale = Math.max(width / SOURCE_W, height / SOURCE_H);
      offsetX = (width - SOURCE_W * sceneScale) / 2;
      offsetY = (height - SOURCE_H * sceneScale) / 2;
      if (!active) clear();
    }

    function clear() {
      if (transparent) ctx.clearRect(0, 0, width, height);
      else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
      }
    }

    function keyBlackToAlpha(imageData) {
      var data = imageData.data;
      for (var i = 0; i < data.length; i += 4) {
        var light = Math.max(data[i], data[i + 1], data[i + 2]);
        var alpha = clamp((light - 16) * 15, 0, 255);
        // Remove the black matte mixed into partially transparent edge pixels.
        if (alpha > 0 && alpha < 255) {
          var unmatte = 255 / alpha;
          data[i] = Math.min(255, data[i] * unmatte);
          data[i + 1] = Math.min(255, data[i + 1] * unmatte);
          data[i + 2] = Math.min(255, data[i + 2] * unmatte);
        }
        data[i + 3] = Math.min(data[i + 3], alpha);
      }
      return imageData;
    }

    function makeTransparentSource() {
      var work = document.createElement("canvas");
      work.width = SOURCE_W;
      work.height = SOURCE_H;
      var paint = work.getContext("2d", { willReadFrequently: true });
      paint.drawImage(source, 0, 0, SOURCE_W, SOURCE_H);
      var pixels = paint.getImageData(0, 0, SOURCE_W, SOURCE_H);
      paint.putImageData(keyBlackToAlpha(pixels), 0, 0);
      // Remove the partial checkerboard flower before creating any sprites,
      // so neither the background nor neighbouring flower crops retain it.
      paint.clearRect(180, 950, 165, 74);
      return work;
    }

    function makeFlowerSprite(transparentSource, spec) {
      var padding = 8;
      var sx = Math.max(0, Math.floor(spec.x - spec.rx - padding));
      var sy = Math.max(0, Math.floor(spec.y - spec.ry - padding));
      var sw = Math.min(SOURCE_W - sx, Math.ceil(spec.rx * 2 + padding * 2));
      var sh = Math.min(SOURCE_H - sy, Math.ceil(spec.ry * 2 + padding * 2));
      var localX = spec.x - sx;
      var localY = spec.y - sy;
      var layers = [];
      for (var i = 0; i < spec.rings.length - 1; i++) {
        var inner = spec.rings[i];
        var outer = spec.rings[i + 1];
        var sprite = document.createElement("canvas");
        sprite.width = sw;
        sprite.height = sh;
        var paint = sprite.getContext("2d");
        paint.save();
        paint.beginPath();
        paint.ellipse(localX, localY, spec.rx * outer + 2, spec.ry * outer + 2, 0, 0, Math.PI * 2);
        if (inner > 0) {
          paint.ellipse(
            localX,
            localY,
            Math.max(0, spec.rx * inner - 2),
            Math.max(0, spec.ry * inner - 2),
            0,
            0,
            Math.PI * 2,
            true
          );
        }
        paint.clip("evenodd");
        paint.drawImage(transparentSource, sx, sy, sw, sh, 0, 0, sw, sh);
        paint.restore();
        layers.push({ image: sprite, centerX: localX, centerY: localY });
      }
      return {
        spec: spec,
        layers: layers,
        motion: { x: 0, y: 0, vx: 0, vy: 0, rotation: 0, spin: 0, touching: false },
      };
    }

    function makeDecorations(transparentSource) {
      var layer = document.createElement("canvas");
      layer.width = SOURCE_W;
      layer.height = SOURCE_H;
      var paint = layer.getContext("2d");
      paint.drawImage(transparentSource, 0, 0);
      paint.globalCompositeOperation = "destination-out";
      for (var i = 0; i < flowerSpecs.length; i++) {
        var spec = flowerSpecs[i];
        paint.beginPath();
        var clearance = 1.12;
        paint.ellipse(spec.x, spec.y, spec.rx * clearance, spec.ry * clearance, 0, 0, Math.PI * 2);
        paint.fill();
      }
      // Keep the loose pieces around the first flower separate from the
      // background, so they follow its size and timing instead of freezing.
      topDecorations = document.createElement("canvas");
      topDecorations.width = 252;
      topDecorations.height = 250;
      topDecorations.getContext("2d").drawImage(layer, 320, 0, 252, 250, 0, 0, 252, 250);
      paint.globalCompositeOperation = "destination-out";
      paint.fillRect(320, 0, 252, 250);
      // The reference is cropped through a flower at the bottom edge.
      paint.fillRect(180, 950, 165, 74);
      return layer;
    }

    function splitDecorations(layer) {
      var pixels = layer.getContext('2d', {willReadFrequently:true}).getImageData(0,0,SOURCE_W,SOURCE_H).data;
      var visited = new Uint8Array(SOURCE_W * SOURCE_H), pieces = [];
      for (var start=0; start<visited.length; start++) {
        if (visited[start] || pixels[start*4+3] < 80) continue;
        var stack=[start], points=[], minX=SOURCE_W, maxX=0, minY=SOURCE_H, maxY=0;
        visited[start]=1;
        while(stack.length) {
          var p=stack.pop(), x=p%SOURCE_W, y=(p/SOURCE_W)|0;
          points.push(p); minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y);
          var neighbours=[p-1,p+1,p-SOURCE_W,p+SOURCE_W];
          for(var n=0;n<4;n++) { var q=neighbours[n]; if(q<0 || q>=visited.length || (n===0 && x===0) || (n===1 && x===SOURCE_W-1) || visited[q] || pixels[q*4+3]<80) continue; visited[q]=1; stack.push(q); }
        }
        if(points.length<12) continue;
        var w=maxX-minX+1,h=maxY-minY+1;
        var sprite=document.createElement('canvas'); sprite.width=w; sprite.height=h;
        var c=sprite.getContext('2d'), image=c.createImageData(w,h);
        points.forEach(function(pos){var sx=pos%SOURCE_W,sy=(pos/SOURCE_W)|0, dest=((sy-minY)*w+sx-minX)*4; for(var j=0;j<4;j++) image.data[dest+j]=pixels[pos*4+j];});
        c.putImageData(image,0,0);
        if(w<=32 && h<=32) {
          var cx=minX+w/2, cy=minY+h/2, closest=0, best=Infinity;
          for(var f=0;f<flowerSpecs.length;f++) {
            var spec=flowerSpecs[f];
            var distance=Math.hypot((cx-spec.x)/spec.rx,(cy-spec.y)/spec.ry);
            if(distance<best){best=distance;closest=f;}
          }
          pieces.push({image:sprite,x:minX,y:minY,w:w,h:h,phase:start*.017,flowerIndex:closest});
        }
      }
      return pieces;
    }

    function prepareAssets() {
      var transparentSource = makeTransparentSource();
      decorations = makeDecorations(transparentSource);
      decorationPieces = splitDecorations(decorations);
      flowers = flowerSpecs.map(function (spec) {
        return makeFlowerSprite(transparentSource, spec);
      });
      buildParticles(transparentSource);
      ready = true;
      if (active) { started = performance.now(); lastFrame = 0; schedule(); }
    }

    // Use shaped decorations from the existing artwork without recoloring.
    // Each burst samples the flower's own colors and selects matching sprites.
    function buildParticles(artwork) {
      var paint = artwork.getContext('2d', { willReadFrequently: true });
      var data = paint.getImageData(0, 0, SOURCE_W, SOURCE_H).data;
      var palettes = {
        'top-radial':['#f36d8e','#b1f2cf','#ffe67c','#c7b4f0','#b6e5f3'],
        'blue-disc':['#27bafb','#3981ee','#9a70e9','#b9f1dc'],
        'pink-disc':['#f38ab5','#a35be0','#fff2f4'], 'cyan-gear':['#9eeef2','#8bd6ee','#ddc0ef'],
        'pink-gear':['#fa91be','#e9599d'], 'red-flower':['#ef4862','#bd2541'],
        'candy-pair':['#f47da5','#f6f1f2','#489ba8'], 'mint-star':['#b3f6dd','#e5fff5'],
        'yellow-star':['#fff382','#ffdf4e'], 'crystal-star':['#f18db4','#91d6ed','#aa77eb'],
        'mint-radial':['#82e5c0','#b9f2d9'], 'pale-star':['#e9e1fd','#b4cbe8'],
        'ring':['#f5f3f4','#8bdab9'], 'candy-bottom':['#f47da5','#fff2f3','#50a6ac'],
        'large-radial':['#f45b88','#a8edca','#f5e67d','#c7a9ee'],
        'purple-radial':['#a77dda','#d8b3f4'], 'green-radial':['#8ce5bc','#b8f3d1']
      };
      function makeParticle(color, shape) {
        var sprite=document.createElement('canvas'); sprite.width=18; sprite.height=18;
        var c=sprite.getContext('2d'); c.fillStyle=color; c.beginPath();
        if(shape===0) c.arc(9,9,5.5,0,Math.PI*2);
        else if(shape===1) c.roundRect(3,3,12,12,2.5);
        else { for(var j=0;j<8;j++){var a=-Math.PI/2+j*Math.PI/4, r=j%2?3:8; var x=9+Math.cos(a)*r,y=9+Math.sin(a)*r; if(j===0)c.moveTo(x,y);else c.lineTo(x,y);} c.closePath(); }
        c.fill(); c.globalAlpha=.35; c.fillStyle='#fff'; c.beginPath(); c.arc(7,6,1.6,0,Math.PI*2); c.fill();
        return sprite;
      }
      var seed=8137;
      function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
      particles = flowerSpecs.map(function(spec){
        var items=[];
        var palette=palettes[spec.name];
        for(var i=0;i<42;i++){
          var angle=random()*Math.PI*2, radius=Math.sqrt(random())*.8;
          var dx=Math.cos(angle)*spec.rx*radius,dy=Math.sin(angle)*spec.ry*radius;
          var x=clamp(Math.round(spec.x+dx),0,SOURCE_W-1),y=clamp(Math.round(spec.y+dy),0,SOURCE_H-1);
          var p=(y*SOURCE_W+x)*4;
          var tinted=makeParticle(palette[Math.floor(random()*palette.length)], Math.floor(random()*3));
          var direction=angle+(random()-.5)*.4,speed=65+random()*85;
          items.push({image:tinted,w:18,h:18,dx:dx,dy:dy,vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed-20,spin:(random()-.5)*3,delay:random()*.13,life:1.4+random()*.5});
        }
        return items;
      });
    }

    function drawParticles(flower, index, time) {
      var items=particles[index] || [], spec=flower.spec;
      var centerX=offsetX+spec.x*sceneScale+flower.motion.x;
      var centerY=offsetY+spec.y*sceneScale+flower.motion.y;
      for(var i=0;i<items.length;i++){
        var item=items[i], age=time-spec.exit-item.delay;
        if(age<0 || age>=item.life) continue;
        var px=centerX+(item.dx*flowerSize+item.vx*age)*sceneScale;
        var py=centerY+(item.dy*flowerSize+item.vy*age+25*age*age)*sceneScale;
        if (onFace(px, py)) continue;
        ctx.save();ctx.translate(px,py);ctx.rotate(item.spin*age);
        ctx.globalAlpha=1-smooth((age-item.life+.25)/.25);
        var w=item.w*sceneScale*.95,h=item.h*sceneScale*.95;
        ctx.drawImage(item.image,-w/2,-h/2,w,h);ctx.restore();
      }
    }

    function schedule() {
      if (!frameHandle && active && !document.hidden) {
        frameHandle = requestAnimationFrame(render);
      }
    }

    function updateHead(dt) {
      if (!headTarget) {
        headState = null;
        return;
      }
      if (!headState) {
        headState = { x: headTarget.x, y: headTarget.y, rx: headTarget.rx, ry: headTarget.ry, vx: 0, vy: 0 };
        return;
      }
      var follow = 1 - Math.exp(-dt * 12);
      var oldX = headState.x;
      var oldY = headState.y;
      headState.x += (headTarget.x - headState.x) * follow;
      headState.y += (headTarget.y - headState.y) * follow;
      headState.rx += (headTarget.rx - headState.rx) * follow;
      headState.ry += (headTarget.ry - headState.ry) * follow;
      headState.vx = clamp((headState.x - oldX) / Math.max(dt, 0.001), -650, 650);
      headState.vy = clamp((headState.y - oldY) / Math.max(dt, 0.001), -650, 650);
    }

    function onFace(x, y) {
      if (!headState) return false;
      var dx=(x-headState.x)/Math.max(1,headState.rx*1.25);
      var dy=(y-headState.y)/Math.max(1,headState.ry*1.18);
      return dx*dx+dy*dy < 1;
    }

    // Only a moving head approaching a flower imparts a small push.
    function updateFlowerPhysics(flower, dt, visibleScale, localTime) {
      var motion = flower.motion;
      var damping = Math.exp(-dt * 3.0);
      motion.vx *= damping;
      motion.vy *= damping;
      motion.spin *= Math.exp(-dt * 2.25);
      motion.x += motion.vx * dt;
      motion.y += motion.vy * dt;
      motion.rotation += motion.spin * dt;

      var touching = false;
      // Let each flower finish its entrance and remain visible for one second.
      if (headState && localTime >= flower.spec.enter + 1.5) {
        var spec = flower.spec;
        var centerX = offsetX + spec.x * sceneScale + motion.x;
        var centerY = offsetY + spec.y * sceneScale + motion.y;
        var radiusX = spec.rx * sceneScale * visibleScale * 0.85;
        var radiusY = spec.ry * sceneScale * visibleScale * 0.85;
        var colliderX = headState.x;
        var colliderY = headState.y;
        var colliderRx = headState.rx * 0.88;
        var colliderRy = headState.ry * 0.88;
        var reachX = colliderRx + radiusX;
        var reachY = colliderRy + radiusY;
        var dx = centerX - colliderX;
        var dy = centerY - colliderY;
        var distance = Math.hypot(dx / Math.max(1, reachX), dy / Math.max(1, reachY));

        if (distance < 1) {
          touching = true;
          var length = Math.max(1, Math.hypot(dx, dy));
          var nx = dx / length;
          var ny = dy / length;
          if (length < 2) {
            nx = headState.vx >= 0 ? 1 : -1;
            ny = -0.2;
          }
          var approach = headState.vx * nx + headState.vy * ny;
          if (approach > 8) {
            var push = Math.min(110, 30 + approach * 0.65);
            var slide = dy < 0 ? -1 : 1;
            var response = 1 - Math.exp(-dt * 7);
            motion.vx += (nx * push * 0.55 - motion.vx) * response;
            motion.vy += (slide * push * 0.7 - motion.vy) * response;
            if (!motion.touching && typeof options.onCollision === "function") options.onCollision(spec.name);
          }
        }
      }

      motion.vx = clamp(motion.vx, -90, 90);
      motion.vy = clamp(motion.vy, -90, 90);
      motion.spin = clamp(motion.spin, -2.2, 2.2);
      motion.rotation = clamp(motion.rotation, -0.48, 0.48);
      // Retain the initial composition and prevent a push from moving its
      // centre beyond the screen. Stop velocity instead of bouncing.
      var baseX=offsetX+flower.spec.x*sceneScale, baseY=offsetY+flower.spec.y*sceneScale;
      var minX=Math.min(0,-baseX), maxX=Math.max(0,width-baseX);
      var minY=Math.min(0,-baseY), maxY=Math.max(0,height-baseY);
      if (motion.x < minX || motion.x > maxX) { motion.x=clamp(motion.x,minX,maxX); motion.vx=0; }
      if (motion.y < minY || motion.y > maxY) { motion.y=clamp(motion.y,minY,maxY); motion.vy=0; }
      motion.touching = touching;
    }

    function layerState(time, spec, index, count) {
      var appearAt = spec.enter;
      var grow = back((time - appearAt) / 0.50);
      var alpha = 1 - smooth((time - spec.exit) / 0.16);
      return { grow: grow, alpha: alpha };
    }

    function drawDecorations(elapsed) {
      if (!decorations) return;
      // Only isolated small shapes survive component filtering; keep them off
      // the detected face, rather than restoring the unfiltered raster layer.
      ctx.save();
      for (var i=0;i<decorationPieces.length;i++) {
        var piece=decorationPieces[i], dx=reduced?0:Math.sin(elapsed*1.2+piece.phase)*3, dy=reduced?0:Math.cos(elapsed*1.5+piece.phase)*4;
        var spec=flowerSpecs[piece.flowerIndex];
        var local=looping ? elapsed % (spec.exit + 1.95) : elapsed;
        var appear=smooth((local-spec.enter)/0.42);
        var disappear=1-smooth((local-spec.exit)/0.30);
        ctx.globalAlpha=appear*disappear*0.94;
        if (ctx.globalAlpha<=0) continue;
        if (onFace(offsetX+(piece.x+piece.w/2+dx)*sceneScale, offsetY+(piece.y+piece.h/2+dy)*sceneScale)) continue;
        ctx.drawImage(piece.image,offsetX+(piece.x+dx)*sceneScale,offsetY+(piece.y+dy)*sceneScale,piece.w*sceneScale,piece.h*sceneScale);
      }
      ctx.restore();
    }

    function drawTopDecorations(time) {
      if (!topDecorations || !flowers.length) return;
      var flower = flowers[0], spec = flower.spec;
      var grow = back((time - spec.enter) / .50);
      var alpha = 1 - smooth((time - spec.exit) / .3);
      if (!grow || !alpha) return;
      var t = Math.max(0, time - spec.enter);
      var breathe = reduced ? 1 : 1 + Math.sin(t * 2 + spec.x) * .07;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (transparent && headState) {
        ctx.beginPath();
        ctx.rect(0,0,width,height);
        ctx.ellipse(headState.x,headState.y,headState.rx*1.25,headState.ry*1.18,0,0,Math.PI*2);
        ctx.clip('evenodd');
      }
      ctx.translate(offsetX + spec.x * sceneScale + flower.motion.x, offsetY + spec.y * sceneScale + flower.motion.y);
      ctx.rotate(flower.motion.rotation + (reduced ? 0 : Math.sin(t * .8 + spec.x) * .16));
      ctx.scale(sceneScale * flowerSize * grow * breathe, sceneScale * flowerSize * grow * breathe);
      ctx.drawImage(topDecorations, 320 - spec.x, -spec.y);
      ctx.restore();
    }

    function drawFlower(flower, time, dt) {
      var spec = flower.spec;
      var count = flower.layers.length;
      var states = new Array(count);
      var visible = false;
      for (var i = 0; i < count; i++) {
        states[i] = layerState(time, spec, i, count);
        if (states[i].grow > 0 && states[i].alpha > 0) visible = true;
      }
      if (!visible) return;

      updateFlowerPhysics(flower, dt, flowerSize, time);
      var localTime = Math.max(0, time - spec.enter);
      for (var layerIndex = count - 1; layerIndex >= 0; layerIndex--) {
        var layer = flower.layers[layerIndex];
        var state = states[layerIndex];
        if (state.grow <= 0 || state.alpha <= 0) continue;
        var scale = flowerSize * state.grow;
        var drawW = layer.image.width * sceneScale * scale;
        var drawH = layer.image.height * sceneScale * scale;
        var centerX = layer.centerX / layer.image.width;
        var centerY = layer.centerY / layer.image.height;
        ctx.save();
        ctx.globalAlpha = state.alpha;
        ctx.translate(offsetX + spec.x * sceneScale + flower.motion.x, offsetY + spec.y * sceneScale + flower.motion.y);
        ctx.rotate(flower.motion.rotation + (reduced ? 0 : Math.sin(localTime * 0.8 + spec.x) * 0.16));
        var breathe = reduced ? 1 : 1 + Math.sin(localTime * 2 + spec.x) * 0.07;
        ctx.scale(breathe, breathe);
        ctx.drawImage(layer.image, -drawW * centerX, -drawH * centerY, drawW, drawH);
        ctx.restore();
      }
    }

    function render(now) {
      frameHandle = 0;
      clear();
      if (!active) return;
      if (!ready) {
        schedule();
        return;
      }

      var elapsed = (now - started) / 1000;
      if (!looping && elapsed >= ONE_SHOT_DURATION) {
        active = false;
        clear();
        return;
      }
      if (looping) elapsed %= SHOW_DURATION;

      var dt = Math.min(0.033, Math.max(0.001, (now - (lastFrame || now - 16.7)) / 1000));
      lastFrame = now;
      updateHead(dt);
      drawDecorations(elapsed);
      for (var i = 0; i < flowers.length; i++) {
        var local = looping ? elapsed % (flowers[i].spec.exit + 1.95) : elapsed;
        if (flowers[i].lastLocal != null && local < flowers[i].lastLocal) {
          flowers[i].motion = {x:0,y:0,vx:0,vy:0,rotation:0,spin:0,touching:false};
        }
        flowers[i].lastLocal = local;
        drawFlower(flowers[i], local, dt);
        if (i === 0) drawTopDecorations(local);
        drawParticles(flowers[i], i, local);
      }
      schedule();
    }

    function trigger() {
      active = true;
      started = performance.now();
      lastFrame = 0;
      for (var i = 0; i < flowers.length; i++) {
        flowers[i].motion = { x: 0, y: 0, vx: 0, vy: 0, rotation: 0, spin: 0, touching: false };
        flowers[i].lastLocal = null;
      }
      schedule();
    }

    function stop() {
      active = false;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      clear();
    }

    function setHead(target) {
      headTarget = target ? { x: target.x, y: target.y, rx: target.rx, ry: target.ry } : null;
      if (!target) headState = null;
    }

    if (options.interactive !== false) canvas.addEventListener("pointerdown", trigger);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && frameHandle) {
        cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      } else schedule();
    });
    source.addEventListener("load", prepareAssets);
    source.addEventListener("error", function () {
      active = false;
      clear();
      ctx.fillStyle = "#fff";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("未能载入 firework-visual.png", width / 2, height / 2);
    });

    resize();
    source.src = './firework-reference.jpg';
    if (active) schedule();

    return { trigger: trigger, stop: stop, resize: resize, setHead: setHead, isPlaying: function () { return active; } };
  }

  global.createFireworkComposition = createFireworkComposition;
  var previewCanvas = document.getElementById("fireworks");
  if (previewCanvas) {
    createFireworkComposition(previewCanvas, {
      autoplay: true,
      loop: true,
      interactive: true,
      flowerSize: 1,
    });
  }
})(globalThis);
