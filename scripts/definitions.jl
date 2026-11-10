module ReviewDefinitions

using SHA
using TOML

clean(x::Expr) = Expr(x.head, (clean(a) for a in x.args if !(a isa LineNumberNode))...)
clean(x) = x
printed(x) = string(clean(x))
macro_name(x::QuoteNode) = string(x.value)
macro_name(x::GlobalRef) = string(x.mod, '.', x.name)
macro_name(x::Expr) = x.head == :. ? join(macro_name.(x.args), ".") : string(x)
macro_name(x) = string(x)

function signature_call(x)
    while x isa Expr && x.head in (:where, :(::))
        x = first(x.args)
    end
    return x
end

function declarations(source, path)
    records = Dict{String,Any}[]
    notes = Dict{String,Any}[]
    note(line, text) = push!(notes, Dict("path" => path, "line" => line, "text" => text))
    function walk(x, scope, line, wrappers=String[])
        x isa Expr || return
        if x.head in (:error, :incomplete)
            error("$path:$line: $(first(x.args))")
        elseif x.head in (:quote, :inert)
            note(line, "Quoted code was not expanded.")
            return
        elseif x.head == :macrocall
            name = macro_name(first(x.args))
            at = length(x.args) > 1 && x.args[2] isa LineNumberNode ? x.args[2].line : line
            if endswith(name, "@eval")
                note(at, "@eval may create definitions. Inspect it separately.")
                return
            end
            doc = endswith(name, "@doc")
            annotations = ["@inline", "@noinline", "@generated", "@constprop", "@propagate_inbounds", "@assume_effects", "@nospecialize", "@public"]
            if !doc && !any(endswith(name, a) for a in annotations)
                note(at, "Macro $name was not expanded. Only written declarations are listed.")
            end
            for a in x.args[3:end]
                walk(a, scope, at, doc ? wrappers : [wrappers; printed(x)])
            end
            return
        elseif x.head == :module
            walk(last(x.args), [scope; string(x.args[2])], line)
            return
        end
        kind = nothing
        signature = nothing
        name = nothing
        if x.head in (:struct, :abstract, :primitive)
            kind = "type"
            signature = x.args[x.head == :struct ? 2 : 1]
            name = signature
            while name isa Expr && name.head in (:(<:), :curly)
                name = first(name.args)
            end
        elseif x.head in (:function, :macro) || x.head == :(=) && signature_call(first(x.args)) isa Expr && signature_call(first(x.args)).head == :call
            signature = first(x.args)
            call = signature_call(signature)
            if call isa Expr && call.head == :tuple
                note(line, "Anonymous function is included in its enclosing definition.")
            else
                kind = x.head == :macro ? "macro" : "method"
                name = call isa Expr && call.head == :call ? first(call.args) : call
            end
        end
        if kind !== nothing
            if occursin('\$', printed(name))
                note(line, "Interpolated declaration needs manual inspection.")
                return
            end
            push!(records, Dict("kind" => kind, "name" => join([scope; printed(name)], "."),
                "signature" => printed(signature), "scope" => join(scope, "."), "path" => path,
                "line" => max(1, line), "fingerprint" => bytes2hex(sha256(join(wrappers, " ") * printed(x)))))
            childscope = [scope; kind == "type" ? printed(name) : printed(signature)]
            for a in x.args[2:end]
                walk(a, childscope, line)
            end
            return
        end
        if x.head == :call && string(first(x.args)) in ("eval", "Core.eval", "Base.eval", "include", "include_string")
            note(line, "$(first(x.args)) may load or generate definitions outside this file.")
        end
        current = line
        for a in x.args
            if a isa LineNumberNode
                current = a.line
            else
                walk(a, scope, current, wrappers)
            end
        end
    end
    walk(Meta.parseall(source; filename=path), String[], 1)
    return Dict("definitions" => records, "notes" => unique(notes))
end

function json(io, value)
    if value isa AbstractString
        print(io, '"')
        for c in value
            if c in ('"', '\\')
                print(io, '\\', c)
            elseif Int(c) < 32
                print(io, "\\u", string(Int(c); base=16, pad=4))
            else
                print(io, c)
            end
        end
        print(io, '"')
    elseif value isa AbstractDict
        print(io, '{')
        for (i, key) in enumerate(sort!(collect(keys(value))))
            i > 1 && print(io, ',')
            json(io, key); print(io, ':'); json(io, value[key])
        end
        print(io, '}')
    elseif value isa AbstractVector
        print(io, '[')
        for (i, item) in enumerate(value)
            i > 1 && print(io, ',')
            json(io, item)
        end
        print(io, ']')
    else
        print(io, value)
    end
end

function main(args)
    length(args) == 1 || error("Usage: definitions.jl manifest.toml")
    manifest = TOML.parsefile(only(args))
    output = [merge(Dict("key" => file["key"]), declarations(read(file["file"], String), file["path"])) for file in get(manifest, "files", [])]
    json(stdout, output)
end

end

if abspath(PROGRAM_FILE) == @__FILE__
    try
        ReviewDefinitions.main(ARGS)
    catch err
        println(stderr, "review-docs: ", sprint(showerror, err))
        exit(1)
    end
end
