const iterations = 1_000_000;
const resolvedCategories = {
  color: { traits: { color: 'red', val: 1 } },
  width: { traits: { width: 100, val: null } },
  borderColor: { traits: { borderColor: 'blue', x: 2 } },
  shape: { traits: { shape: 'rect' } },
  texture: { traits: { textureStyle: 'smooth', y: undefined, z: 5 } }
};

function runEntries() {
  let categoryTraits = {};
  ['color', 'width', 'borderColor', 'shape', 'texture'].forEach((dimension) => {
    const catTraits = resolvedCategories[dimension]?.traits;
    if (!catTraits || typeof catTraits !== 'object') {
      return;
    }
    Object.entries(catTraits).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }
      if (categoryTraits[key] === undefined) {
        categoryTraits[key] = value;
      }
    });
  });
  return categoryTraits;
}

function runForIn() {
  let categoryTraits = {};
  ['color', 'width', 'borderColor', 'shape', 'texture'].forEach((dimension) => {
    const catTraits = resolvedCategories[dimension]?.traits;
    if (!catTraits || typeof catTraits !== 'object') {
      return;
    }
    for (const key in catTraits) {
      const value = catTraits[key];
      if (value === null || value === undefined) {
        continue;
      }
      if (categoryTraits[key] === undefined) {
        categoryTraits[key] = value;
      }
    }
  });
  return categoryTraits;
}

const startEntries = performance.now();
for (let i = 0; i < iterations; i++) {
  runEntries();
}
const endEntries = performance.now();
console.log(`Object.entries took: ${endEntries - startEntries} ms`);

const startForIn = performance.now();
for (let i = 0; i < iterations; i++) {
  runForIn();
}
const endForIn = performance.now();
console.log(`for...in took: ${endForIn - startForIn} ms`);
console.log(`Improvement: ${((endEntries - startEntries) - (endForIn - startForIn)) / (endEntries - startEntries) * 100}%`);
