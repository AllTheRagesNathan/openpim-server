import * as fs from 'fs'
import { Item } from '../models/items'
import * as JPEG from 'jpeg-js'
import * as Jimp from 'jimp'
import { mergeValues } from '../resolvers/utils'
import {File} from 'formidable'
import logger from '../logger'
import { Channel, ChannelExecution } from '../models/channels'
import { Process } from '../models/processes'

export class FileManager {
    private static instance: FileManager
    private filesRoot: string

    private constructor() {
        this.filesRoot = process.env.FILES_ROOT!
        Jimp.decoders['image/jpeg'] = (data: Buffer) => JPEG.decode(data, { maxMemoryUsageInMB: 1024 })
    }

    public static getInstance(): FileManager {
        if (!FileManager.instance) {
            FileManager.instance = new FileManager()
        }

        return FileManager.instance
    }

    public getFilesRoot() {
        return this.filesRoot
    }

    public async removeFile(item: Item) {
        const folder = ~~(item.id/1000)

        const filesPath = '/' +item.tenantId + '/' + folder
        const relativePath = filesPath + '/' + item.id
        const fullPath = this.filesRoot + relativePath

        if (fs.existsSync(fullPath)) { 
            fs.unlink(fullPath, (err) => {
                if (err) logger.error('Error deleting file:' + fullPath, err)
            })
        } else {
            logger.error(fullPath + ' no such file found for item id: ' + item.id);
        }
        const thumb = fullPath + '_thumb.jpg'
        if (fs.existsSync(thumb)) {
            fs.unlink(thumb, (err) => {
                if (err) logger.error('Error deleting file:' + thumb, err)
            })
        } else {
            logger.error(thumb + ' no such file found for item id: ' + item.id);
        } 

        let values
        if (this.isImage(item.mimeType)) {
            values = {
                image_width: '',
                image_height: '',
                image_type: '',
                file_type: '',
                image_rgba: ''
            }
        } else {
            values = {
                file_type: ''
            }
        }
        item.values = mergeValues(values, item.values)        
        item.storagePath = ''
    }

    public async saveChannelFile(tenantId: string, channelId: number, exec: ChannelExecution, file: string) {
        const tst = '/' + tenantId
        if (!fs.existsSync(this.filesRoot + tst)) fs.mkdirSync(this.filesRoot + tst)

        const filesPath = '/' + tenantId + '/channels/' + channelId
        if (!fs.existsSync(this.filesRoot + filesPath)) fs.mkdirSync(this.filesRoot + filesPath, {recursive: true})

        const relativePath = filesPath + '/' + exec.id
        const fullPath = this.filesRoot + relativePath
        try {
            fs.renameSync(file, fullPath)
        } catch (e) { 
            // logger.error('Failed to rename file (will use copy instead): ', file, fullPath)
            // logger.error(e)
            fs.copyFileSync(file, fullPath)
            fs.unlinkSync(file)
        }

        exec.storagePath = relativePath

        return fullPath
    }

	public async saveChannelXlsxTemplate(tenantId: string, channel: Channel, file: File) {
        const tst = '/' + tenantId
        if (!fs.existsSync(this.filesRoot + tst)) {
			fs.mkdirSync(this.filesRoot + tst)
		}

        const filesPath = '/' + tenantId + '/excelTemplateChannel'
        if (!fs.existsSync(this.filesRoot + filesPath)) {
			fs.mkdirSync(this.filesRoot + filesPath, {recursive: true})
		}

        const relativePath = filesPath + '/' + channel.identifier
        const fullPath = this.filesRoot + relativePath
        try {
            fs.renameSync(file.filepath, fullPath)
        } catch (e) { 
            // logger.error('Failed to rename file (will use copy instead): ', file, fullPath)
            // logger.error(e)
            fs.copyFileSync(file.filepath, fullPath)
            fs.unlinkSync(file.filepath)
        }

		channel.config.template = fullPath
		channel.changed('config', true)

        return fullPath
    }

    public async saveProcessFile(tenantId: string, process: Process, file: string, mimetype: string, filename: string, clean = true) {
        const tst = '/' + tenantId
        if (!fs.existsSync(this.filesRoot + tst)) fs.mkdirSync(this.filesRoot + tst)

        const filesPath = '/' + tenantId + '/processes/'
        if (!fs.existsSync(this.filesRoot + filesPath)) fs.mkdirSync(this.filesRoot + filesPath, {recursive: true})

        const relativePath = filesPath  + process.id
        const fullPath = this.filesRoot + relativePath
        if (clean) {
            try {
                fs.renameSync(file, fullPath)
            } catch (e) { 
                fs.copyFileSync(file, fullPath)
                fs.unlinkSync(file)
            }
        } else {
            fs.copyFileSync(file, fullPath)
        }

        process.storagePath = relativePath
        process.mimeType = mimetype
        process.fileName = filename

        return fullPath
    }

    public async saveFile(tenantId: string, item: Item, filepath: string, mimetype: string | null, originalFilename: string | null, size: number, clean = true ) {
        const folder = ~~(item.id/1000)

        const tst = '/' + tenantId
        if (!fs.existsSync(this.filesRoot + tst)) fs.mkdirSync(this.filesRoot + tst)

        const filesPath = '/' + tenantId + '/' + folder
        if (!fs.existsSync(this.filesRoot + filesPath)) fs.mkdirSync(this.filesRoot + filesPath)

        const relativePath = filesPath + '/' + item.id
        const fullPath = this.filesRoot + relativePath
        if (clean) {
            try {
                fs.renameSync(filepath, fullPath)
            } catch (e) { 
                fs.copyFileSync(filepath, fullPath)
                fs.unlinkSync(filepath)
            }
        } else {
            fs.copyFileSync(filepath, fullPath)
        }

        item.storagePath = relativePath

        let values
        if (this.isImage(mimetype||'')) {
            const image = await Jimp.read(fullPath)
            values = {
                image_width: image.bitmap.width,
                image_height: image.bitmap.height,
                image_type: image.getExtension(),
                file_type: image.getMIME(),
                file_name: originalFilename||'',
                file_size: size,
                image_rgba: image._rgba
            }

            const w = image.bitmap.width > image.bitmap.height ? 300 : Jimp.AUTO
            const h = image.bitmap.width > image.bitmap.height ? Jimp.AUTO: 300
            image.resize(w, h).quality(70).background(0xffffffff)
            image.write(fullPath + '_thumb.jpg')    
        } else {
            values = {
                file_name: originalFilename||'',
                file_type: mimetype||'',
                file_size: size
            }
        }
        item.values = mergeValues(values, item.values)
    }

    private isImage(mimeType: string) : boolean {
        return (mimeType === 'image/jpeg') 
            || (mimeType === 'image/png') 
            || (mimeType === 'image/bmp') 
            || (mimeType === 'image/tiff')
            || (mimeType === 'image/gif')
    }
}