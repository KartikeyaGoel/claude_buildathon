const SSE_BUFFER_SIZE = 100;
export function formatSseMessage(evt) {
    const payload = { ...evt.data, id: evt.id };
    return `id: ${evt.id}\nevent: ${evt.event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
export function writeSse(res, evt) {
    res.write(formatSseMessage(evt));
}
export function pushEventBuffer(buffer, evt) {
    buffer.push(evt);
    while (buffer.length > SSE_BUFFER_SIZE)
        buffer.shift();
}
export function replaySince(buffer, lastEventIdHeader) {
    if (lastEventIdHeader == null || lastEventIdHeader === "")
        return [];
    const lastId = Number(lastEventIdHeader);
    if (!Number.isFinite(lastId))
        return [];
    return buffer.filter((e) => e.id > lastId);
}
//# sourceMappingURL=sseHelpers.js.map