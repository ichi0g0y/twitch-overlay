export namespace embed {
	
	export class FS {
	
	
	    static createFrom(source: any = {}) {
	        return new FS(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}

}

export namespace faxmanager {
	
	export class Fax {
	    ID: string;
	    UserName: string;
	    Message: string;
	    ImageURL: string;
	    // Go type: time
	    Timestamp: any;
	    ColorPath: string;
	    MonoPath: string;
	
	    static createFrom(source: any = {}) {
	        return new Fax(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.UserName = source["UserName"];
	        this.Message = source["Message"];
	        this.ImageURL = source["ImageURL"];
	        this.Timestamp = this.convertValues(source["Timestamp"], null);
	        this.ColorPath = source["ColorPath"];
	        this.MonoPath = source["MonoPath"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace music {
	
	export class Playlist {
	    id: string;
	    name: string;
	    description: string;
	    // Go type: time
	    created_at: any;
	    track_count: number;
	
	    static createFrom(source: any = {}) {
	        return new Playlist(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.track_count = source["track_count"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PlaylistTrack {
	    id: string;
	    filename: string;
	    title: string;
	    artist: string;
	    album: string;
	    duration: number;
	    has_artwork: boolean;
	    // Go type: time
	    created_at: any;
	    position: number;
	
	    static createFrom(source: any = {}) {
	        return new PlaylistTrack(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.filename = source["filename"];
	        this.title = source["title"];
	        this.artist = source["artist"];
	        this.album = source["album"];
	        this.duration = source["duration"];
	        this.has_artwork = source["has_artwork"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.position = source["position"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace status {
	
	export class StreamStatus {
	    is_live: boolean;
	    // Go type: time
	    started_at?: any;
	    viewer_count: number;
	    // Go type: time
	    last_checked: any;
	
	    static createFrom(source: any = {}) {
	        return new StreamStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.is_live = source["is_live"];
	        this.started_at = this.convertValues(source["started_at"], null);
	        this.viewer_count = source["viewer_count"];
	        this.last_checked = this.convertValues(source["last_checked"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

