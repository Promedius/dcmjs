import { ReadBufferStream, WriteBufferStream } from "./BufferStream";
import { DicomMessage } from "./DicomMessage";
import * as fflate from "fflate";

const EXPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";

class DicomDict {
    constructor(meta) {
        this.meta = meta === undefined ? {} : meta;
        this.dict = {};
    }

    upsertTag(tag, vr, values) {
        if (this.dict[tag]) {
            this.dict[tag].Value = values;
        } else {
            this.dict[tag] = { vr: vr, Value: values };
        }
    }

    write(writeOptions = { allowInvalidVRLength: false }) {
        var metaSyntax = EXPLICIT_LITTLE_ENDIAN;
        var fileStream = new WriteBufferStream(4096, true);
        fileStream.writeHex("00".repeat(128));
        fileStream.writeString("DICM");

        var metaStream = new WriteBufferStream(1024);
        if (!this.meta["00020010"]) {
            this.meta["00020010"] = {
                vr: "UI",
                Value: [EXPLICIT_LITTLE_ENDIAN]
            };
        }
        DicomMessage.write(this.meta, metaStream, metaSyntax, writeOptions);
        DicomMessage.writeTagObject(
            fileStream,
            "00020000",
            "UL",
            metaStream.size,
            metaSyntax,
            writeOptions
        );
        fileStream.concat(metaStream);

        var dictStream = new WriteBufferStream(1024, true);
        var useSyntax = this.meta["00020010"].Value[0];
        DicomMessage.write(this.dict, dictStream, useSyntax, writeOptions);

        // NOTE: Deflated Explicit VR Little Endian이면 압축
        //    https://dicom.nema.org/dicom/2013/output/chtml/part05/sect_A.5.html
        if (useSyntax === "1.2.840.10008.1.2.1.99") {
            let deflatedArray = fflate.deflateSync(
                new Uint8Array(dictStream.getBuffer())
            );

            if (deflatedArray.byteLength % 2 !== 0) {
                deflatedArray = new Uint8Array([...deflatedArray, 0]);
            }

            dictStream = new ReadBufferStream(deflatedArray.buffer);
        }

        fileStream.concat(dictStream);

        return fileStream.getBuffer();
    }
}

export { DicomDict };
