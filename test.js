const fs = require('fs');

function test() {
  const json = JSON.parse(fs.readFileSync('response.json'));
  const env = 'production';
  
  const pods = (json.pods && json.pods.items || []).map(p => ({
    name: p.metadata && p.metadata.name || 'pod',
    namespace: p.metadata && p.metadata.namespace || 'default',
    status: p.status && p.status.phase || 'Running',
    restarts: (p.status && p.status.containerStatuses || []).reduce((s, c) => s + (c.restartCount || 0), 0),
    cpu: 0,
    memory: 0,
    age: p.metadata && p.metadata.creationTimestamp ? new Date(p.metadata.creationTimestamp).toLocaleDateString() : '',
    node: p.spec && p.spec.nodeName || '',
    image: (p.spec && p.spec.containers && p.spec.containers[0] && p.spec.containers[0].image) || '',
  }))

  const deployments = (json.deployments && json.deployments.items || []).map(d => ({
    name: d.metadata && d.metadata.name || 'dep',
    namespace: d.metadata && d.metadata.namespace || 'default',
    ready: `${d.status && d.status.readyReplicas || 0}/${d.status && d.status.replicas || 0}`,
    upToDate: d.status && d.status.updatedReplicas || 0,
    available: d.status && d.status.availableReplicas || 0,
    age: d.metadata && d.metadata.creationTimestamp ? new Date(d.metadata.creationTimestamp).toLocaleDateString() : '',
    image: (d.spec && d.spec.template && d.spec.template.spec && d.spec.template.spec.containers && d.spec.template.spec.containers[0] && d.spec.template.spec.containers[0].image) || '',
  }))

  console.log("Pods length:", pods.length);
  console.log("Deployments length:", deployments.length);
}

try {
  test();
} catch (e) {
  console.error("Caught error:", e);
}
